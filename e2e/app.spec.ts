/**
 * End-to-end Playwright test suite for the Node.js E-Commerce Shop.
 *
 * Design notes:
 *  - Every test that needs an authenticated user creates its OWN unique
 *    account at run time (via `signupAndLogin`). Tests never share a
 *    module-level "test user" so they are fully independent, can run in
 *    any order, and are resilient to worker restarts.
 *  - Selectors are scoped to a specific container (`.main-header__nav`,
 *    `.product-form`, an `<article>` card, etc.) to avoid Playwright
 *    "strict mode" violations where the same link/button appears in both
 *    the desktop header and the mobile drawer nav.
 *  - CSS assertions use Playwright's auto-retrying `toHaveCSS`/`toHaveClass`
 *    matchers instead of one-off `evaluate()` snapshots, so transitions
 *    (e.g. the 0.3s mobile-nav slide) are waited out instead of raced.
 *
 * Coverage:
 *  1.  Public pages load correctly (home, /products)
 *  2.  Auth guard — unauthenticated redirects
 *  3.  Signup — validation errors + successful registration
 *  4.  Login  — validation errors + successful login
 *  5.  Admin  — add product, product appears in shop, edit product, delete product
 *  6.  Shop   — product detail page
 *  7.  Cart   — add item, view cart, remove item
 *  8.  Checkout — page loads with Stripe widget after adding to cart
 *  9.  Orders  — empty state
 * 10.  Password-reset page renders
 * 11.  404 page
 * 12.  Navigation — active link highlighting
 * 13.  CSS / layout — key visual properties (colours, fonts, breakpoints)
 * 14.  Mobile — hamburger menu button visible, desktop nav hidden, drawer opens/closes
 * 15.  Logout
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'test123';

/** Image fixture shipped with the existing Mocha test suite */
const TEST_IMAGE = path.resolve(__dirname, '../test/test-product.png');

/**
 * Suffixes a value with a timestamp + random number so it's unique even
 * when multiple Playwright projects/workers run this same test concurrently
 * (millisecond-resolution `Date.now()` alone can collide across workers).
 */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Generates a unique e-mail so parallel/independent tests never collide */
function uniqueEmail(prefix = 'pw'): string {
  return `${prefix}-${uniqueSuffix()}@example.com`;
}

/** Generates a unique product title so parallel/independent tests never collide */
function uniqueTitle(prefix = 'Product'): string {
  return `${prefix}-${uniqueSuffix()}`;
}

async function signup(page: Page, email: string, password = TEST_PASSWORD): Promise<void> {
  await page.goto('/signup');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#confirmPassword', password);
  await page.click('.login-form button[type=submit]');
  await page.waitForURL('**/login');
}

async function login(page: Page, email: string, password = TEST_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('.login-form button[type=submit]');
  await page.waitForURL('/');
}

/** Creates a brand-new account and logs in with it. Returns the email used. */
async function signupAndLogin(page: Page, prefix = 'pw'): Promise<string> {
  const email = uniqueEmail(prefix);
  await signup(page, email);
  await login(page, email);
  return email;
}

async function addProduct(
  page: Page,
  title = uniqueTitle('Book'),
  price = '12.99',
  description = 'A great book about Playwright testing.'
): Promise<void> {
  await page.goto('/admin/add-product');
  await page.fill('#title', title);
  await page.fill('#price', price);
  await page.fill('#description', description);
  await page.setInputFiles('#image', TEST_IMAGE);
  await page.click('.product-form button[type=submit]');
  await page.waitForURL('**/admin/products');
}

/**
 * The nav links exist twice in the DOM: once in the desktop `.main-header__nav`
 * (hidden below the 768px breakpoint) and once in the `.mobile-nav` drawer
 * (hidden above it via the hamburger-only layout). Pick whichever copy is
 * actually visible for the current viewport instead of assuming desktop.
 */
function navLink(page: Page, href: string) {
  const viewport = page.viewportSize();
  const isDesktop = !viewport || viewport.width >= 768;
  return page.locator(`${isDesktop ? '.main-header__nav' : '.mobile-nav'} a[href="${href}"]`);
}

function navLogoutButton(page: Page) {
  const viewport = page.viewportSize();
  const isDesktop = !viewport || viewport.width >= 768;
  return page.locator(
    `${isDesktop ? '.main-header__nav' : '.mobile-nav'} form[action="/logout"] button`
  );
}

/**
 * Jumps to the last page of the (global, paginated) shop product listing.
 * Newly-added products are normally appended last (natural Mongo insertion
 * order), so the most recently added product is normally on this page — no
 * need for an unbounded "click next until found" loop.
 *
 * Because the listing is global (shared across every concurrently-running
 * test/project), another test can insert a product between this function's
 * page-count lookup and the final navigation, shifting what "last page"
 * means by the time we get there. Callers that need to reliably find a
 * specific product should use `findProductCard`, which retries this.
 */
async function goToLastShopPage(page: Page, basePath: '/' | '/products' = '/'): Promise<void> {
  await page.goto(basePath);
  await page.waitForLoadState('networkidle');
  const paginationLinks = page.locator('.pagination a');
  const count = await paginationLinks.count();
  if (count === 0) return; // only one page, already there
  let lastPage = 1;
  for (let i = 0; i < count; i++) {
    const text = (await paginationLinks.nth(i).innerText()).trim();
    const num = parseInt(text, 10);
    if (!isNaN(num)) lastPage = Math.max(lastPage, num);
  }
  await page.goto(`${basePath}?page=${lastPage}`);
  await page.waitForLoadState('networkidle');
}

/**
 * Finds a product card by title on the global shop listing, retrying the
 * last-page lookup a few times to ride out the race described on
 * `goToLastShopPage` above.
 */
async function findProductCard(
  page: Page,
  basePath: '/' | '/products',
  title: string,
  attempts = 5
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await goToLastShopPage(page, basePath);
    const card = page.locator('article.product-item').filter({ hasText: title });
    if ((await card.count()) > 0) return card;
    if (attempt < attempts) await page.waitForTimeout(300);
  }
  // Out of attempts — return the (empty) locator so the caller's own
  // assertion produces a clear "not found" failure.
  return page.locator('article.product-item').filter({ hasText: title });
}

/**
 * Looks up a product's id via the admin panel, which — unlike the public
 * shop listing — is scoped to the current user's own products and isn't
 * paginated, so it's unaffected by other tests/workers concurrently adding
 * products elsewhere.
 */
async function getProductIdByTitle(page: Page, title: string): Promise<string> {
  await page.goto('/admin/products');
  await page.waitForLoadState('networkidle');
  const card = page.locator('article.product-item').filter({ hasText: title });
  await expect(card).toBeVisible();
  const href = await card.locator('a', { hasText: 'Edit' }).getAttribute('href');
  const match = href?.match(/\/admin\/edit-product\/([^/?]+)/);
  if (!match) throw new Error(`Could not extract product id from Edit link href: ${href}`);
  return match[1];
}

// ─── 1. Public pages ─────────────────────────────────────────────────────────

test.describe('Public pages', () => {
  test('home page (/) loads and shows shop heading or product grid', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Shop/i);
    const grid = page.locator('.grid');
    const empty = page.locator('h1', { hasText: /No Products Found/i });
    expect((await grid.count()) + (await empty.count())).toBeGreaterThan(0);
  });

  test('/products page loads', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveTitle(/Products/i);
  });

  test('navigation bar is rendered on home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.main-header')).toBeVisible();
    await expect(navLink(page, '/')).toBeVisible();
    await expect(navLink(page, '/products')).toBeVisible();
  });
});

// ─── 2. Auth guard ────────────────────────────────────────────────────────────

test.describe('Auth guard', () => {
  test('/cart redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/cart');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/orders redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/admin/add-product redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/admin/add-product');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/checkout redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── 3. Signup ────────────────────────────────────────────────────────────────

test.describe('Signup', () => {
  test('signup page renders the form', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('form.login-form')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    await expect(page.locator('.login-form button[type=submit]')).toBeVisible();
  });

  test('signup shows validation error for invalid email', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('#email', 'not-an-email');
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirmPassword', TEST_PASSWORD);
    await page.click('.login-form button[type=submit]');
    await expect(page).toHaveURL(/\/signup/);
    const errorOrInvalid =
      (await page.locator('.user-message--error').count()) +
      (await page.locator('input.invalid').count());
    expect(errorOrInvalid).toBeGreaterThan(0);
  });

  test('signup shows error when passwords do not match', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('#email', uniqueEmail('mismatch'));
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirmPassword', 'different99');
    await page.click('.login-form button[type=submit]');
    await expect(page).toHaveURL(/\/signup/);
    const errorOrInvalid =
      (await page.locator('.user-message--error').count()) +
      (await page.locator('input.invalid').count());
    expect(errorOrInvalid).toBeGreaterThan(0);
  });

  test('successful signup redirects to /login', async ({ page }) => {
    await signup(page, uniqueEmail('signup-ok'));
    await expect(page).toHaveURL(/\/login/);
  });

  test('duplicate signup shows error', async ({ page }) => {
    const email = uniqueEmail('dup');
    await signup(page, email);
    await page.goto('/signup');
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirmPassword', TEST_PASSWORD);
    await page.click('.login-form button[type=submit]');
    await expect(page).toHaveURL(/\/signup/);
    const errorOrInvalid =
      (await page.locator('.user-message--error').count()) +
      (await page.locator('input.invalid').count());
    expect(errorOrInvalid).toBeGreaterThan(0);
  });
});

// ─── 4. Login ─────────────────────────────────────────────────────────────────

test.describe('Login', () => {
  test('login page renders the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('.login-form button[type=submit]')).toBeVisible();
  });

  test('login shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'nobody@nowhere.com');
    await page.fill('#password', 'wrong99');
    await page.click('.login-form button[type=submit]');
    await expect(page).toHaveURL(/\/login/);
    const errorOrInvalid =
      (await page.locator('.user-message--error').count()) +
      (await page.locator('input.invalid').count());
    expect(errorOrInvalid).toBeGreaterThan(0);
  });

  test('successful login redirects to / and shows authenticated nav', async ({ page }) => {
    const email = uniqueEmail('login-ok');
    await signup(page, email);
    await login(page, email);
    await expect(page).toHaveURL('/');
    await expect(navLink(page, '/cart')).toBeVisible();
    await expect(navLink(page, '/orders')).toBeVisible();
    await expect(navLink(page, '/admin/add-product')).toBeVisible();
  });
});

// ─── 5. Admin ─────────────────────────────────────────────────────────────────

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    await signupAndLogin(page, 'admin');
  });

  test('add-product page renders form', async ({ page }) => {
    await page.goto('/admin/add-product');
    await expect(page.locator('#title')).toBeVisible();
    await expect(page.locator('#price')).toBeVisible();
    await expect(page.locator('#description')).toBeVisible();
    await expect(page.locator('#image')).toBeVisible();
    await expect(page.locator('.product-form button[type=submit]')).toBeVisible();
  });

  test('add-product shows validation error for too-short title', async ({ page }) => {
    await page.goto('/admin/add-product');
    await page.fill('#title', 'AB'); // < 3 chars
    await page.fill('#price', '9.99');
    await page.fill('#description', 'Valid description here.');
    await page.setInputFiles('#image', TEST_IMAGE);
    await page.click('.product-form button[type=submit]');
    await expect(page).toHaveURL(/\/admin\/add-product/);
    await expect(page.locator('.user-message--error')).toBeVisible();
  });

  test('successfully adds a product and it appears in admin list', async ({ page }) => {
    const title = uniqueTitle('Book');
    await addProduct(page, title);
    await expect(page).toHaveURL(/\/admin\/products/);
    await expect(page.locator(`h1:has-text("${title}")`)).toBeVisible();
  });

  test('product appears on shop home page after adding', async ({ page }) => {
    const title = uniqueTitle('ShopBook');
    await addProduct(page, title);
    const card = await findProductCard(page, '/', title);
    await expect(card).toBeVisible();
  });

  test('edit-product page pre-populates fields', async ({ page }) => {
    const title = uniqueTitle('EditBook');
    await addProduct(page, title);
    const card = page.locator('article.product-item').filter({ hasText: title });
    await card.locator('a', { hasText: 'Edit' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#title')).toHaveValue(title);
    await expect(page.locator('#price')).not.toHaveValue('');
    await expect(page.locator('#description')).not.toHaveValue('');
  });

  test('edit-product saves changes', async ({ page }) => {
    const title = uniqueTitle('EditMe');
    await addProduct(page, title);
    const card = page.locator('article.product-item').filter({ hasText: title });
    await card.locator('a', { hasText: 'Edit' }).click();
    await page.waitForLoadState('networkidle');
    const updatedTitle = title + '-Updated';
    await page.fill('#title', updatedTitle);
    await page.click('.product-form button[type=submit]');
    await page.waitForURL('**/admin/products');
    await expect(page.locator(`h1:has-text("${updatedTitle}")`)).toBeVisible();
  });

  test('delete product removes it from admin list', async ({ page }) => {
    const title = uniqueTitle('DeleteMe');
    await addProduct(page, title);
    const card = page.locator('article.product-item').filter({ hasText: title });
    await expect(card).toBeVisible();
    await card.locator('button', { hasText: 'Delete' }).click();
    await expect(card).toHaveCount(0);
  });
});

// ─── 6. Product detail ────────────────────────────────────────────────────────

test.describe('Product detail', () => {
  test('clicking Details navigates to product detail page', async ({ page }) => {
    await signupAndLogin(page, 'detail');
    const title = uniqueTitle('DetailBook');
    await addProduct(page, title);

    const card = await findProductCard(page, '/products', title);
    await expect(card).toBeVisible();
    await card.locator('a.btn', { hasText: 'Details' }).click();

    await page.waitForURL(/\/products\/.+/);
    await expect(page.locator(`h1:has-text("${title}")`)).toBeVisible();
    // Product detail page renders price in a plain <h2> (no .product__price class,
    // that's only used on the card/list views)
    await expect(page.locator('main h2')).toBeVisible();
  });
});

// ─── 7. Cart ──────────────────────────────────────────────────────────────────

/**
 * Adds a product to the cart via its product detail page, looked up
 * deterministically by id (see `getProductIdByTitle`) rather than by
 * paging through the shared, global shop listing — these Cart/Checkout
 * tests care about cart behavior, not listing/pagination behavior, so
 * there's no reason to expose them to that race.
 */
async function addProductToCart(page: Page, title: string): Promise<void> {
  const productId = await getProductIdByTitle(page, title);
  await page.goto(`/products/${productId}`);
  await page.locator('form[action="/cart"] button[type=submit]').click();
  await page.waitForURL('/cart');
}

test.describe('Cart', () => {
  test('cart page loads for a freshly-logged-in user', async ({ page }) => {
    await signupAndLogin(page, 'cart');
    await page.goto('/cart');
    await expect(page).toHaveURL('/cart');
    await expect(page.locator('main')).toBeVisible();
  });

  test('add product to cart and verify it appears', async ({ page }) => {
    await signupAndLogin(page, 'cart');
    const title = uniqueTitle('CartBook');
    await addProduct(page, title);
    await addProductToCart(page, title);
    await expect(page.locator(`h1:has-text("${title}")`)).toBeVisible();
    await expect(page.locator('h2', { hasText: /Quantity/i })).toBeVisible();
  });

  test('remove product from cart', async ({ page }) => {
    await signupAndLogin(page, 'cart');
    const title = uniqueTitle('CartRemove');
    await addProduct(page, title);
    await addProductToCart(page, title);
    const item = page.locator('li.cart__item').filter({ hasText: title });
    await expect(item).toBeVisible();
    await item.locator('button.btn.danger').click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`h1:has-text("${title}")`)).toHaveCount(0);
  });
});

// ─── 8. Checkout ──────────────────────────────────────────────────────────────

test.describe('Checkout', () => {
  test('checkout page shows product list and Stripe widget when cart has items', async ({
    page
  }) => {
    await signupAndLogin(page, 'checkout');
    const title = uniqueTitle('CheckoutBook');
    await addProduct(page, title);
    await addProductToCart(page, title);

    await page.goto('/checkout');
    await expect(page).toHaveURL('/checkout');
    await expect(page.locator('.cart__item-list')).toBeVisible();
    await expect(page.locator(`h1:has-text("${title}")`)).toBeVisible();
    // Stripe Checkout button script should be embedded (present only when a publishable key is configured)
    await expect(page.locator('.stripe-button')).toBeAttached();
  });
});

// ─── 9. Orders ────────────────────────────────────────────────────────────────

test.describe('Orders', () => {
  test('orders page loads and shows empty state for a fresh user', async ({ page }) => {
    await signupAndLogin(page, 'orders');
    await page.goto('/orders');
    await expect(page).toHaveURL('/orders');
    await expect(page.locator('h1', { hasText: /Nothing there/i })).toBeVisible();
  });
});

// ─── 10. Password reset ───────────────────────────────────────────────────────

test.describe('Password reset', () => {
  test('/reset page renders the form', async ({ page }) => {
    await page.goto('/reset');
    await expect(page.locator('input[name=email]')).toBeVisible();
    await expect(page.locator('button[type=submit]')).toBeVisible();
  });

  test('submitting reset with unknown email shows a message (no crash)', async ({ page }) => {
    await page.goto('/reset');
    await page.fill('input[name=email]', 'nobody@nowhere.com');
    await page.click('button[type=submit]');
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  });
});

// ─── 11. 404 page ─────────────────────────────────────────────────────────────

test.describe('Error pages', () => {
  test('404 page is shown for unknown routes', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-xyz');
    expect(response?.status()).toBe(404);
    await expect(page.locator('body')).toContainText(/404|not found|Page Not Found/i);
  });
});

// ─── 12. Active link highlighting ─────────────────────────────────────────────

test.describe('Navigation active link', () => {
  test('Shop link has active class on / (desktop viewport)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.locator('.main-header__nav a.active[href="/"]')).toBeVisible();
  });

  test('Products link has active class on /products (desktop viewport)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/products');
    await expect(page.locator('.main-header__nav a.active[href="/products"]')).toBeVisible();
  });

  test('Shop link has active class on / (mobile viewport)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('.mobile-nav a.active[href="/"]')).toBeAttached();
  });
});

// ─── 13. CSS / Layout ─────────────────────────────────────────────────────────

test.describe('CSS and layout', () => {
  test('header has correct teal background colour', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.main-header')).toHaveCSS('background-color', 'rgb(0, 105, 92)');
  });

  test('buttons use correct border colour', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.btn').first()).toHaveCSS('border-color', 'rgb(0, 105, 92)');
  });

  test('body uses Open Sans font family', async ({ page }) => {
    await page.goto('/');
    const fontFamily = await page
      .locator('body')
      .evaluate(el => window.getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('open sans');
  });

  test('product cards have box-shadow', async ({ page }) => {
    await signupAndLogin(page, 'css-card');
    const title = uniqueTitle('CSSBook');
    await addProduct(page, title);
    const card = page.locator('article.product-item').filter({ hasText: title });
    await expect(card).toBeVisible();
    const shadow = await card.evaluate(el => window.getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe('none');
  });

  test('main element has auto left/right margin (centered layout)', async ({ page }) => {
    await page.goto('/');
    const marginLeft = await page
      .locator('main')
      .evaluate(el => window.getComputedStyle(el).marginLeft);
    const marginRight = await page
      .locator('main')
      .evaluate(el => window.getComputedStyle(el).marginRight);
    expect(marginLeft).toBe(marginRight);
  });

  test('product form is centered (margin: auto)', async ({ page }) => {
    await signupAndLogin(page, 'css-form');
    await page.goto('/admin/add-product');
    const marginLeft = await page
      .locator('.product-form')
      .evaluate(el => window.getComputedStyle(el).marginLeft);
    const marginRight = await page
      .locator('.product-form')
      .evaluate(el => window.getComputedStyle(el).marginRight);
    expect(marginLeft).toBe(marginRight);
  });

  test('pagination links use correct colour when pagination is present', async ({ page }) => {
    await signupAndLogin(page, 'css-pag');
    // Add 3 products — enough to guarantee pagination given ITEMS_PER_PAGE = 2
    await addProduct(page, uniqueTitle('Pag1'));
    await addProduct(page, uniqueTitle('Pag2'));
    await addProduct(page, uniqueTitle('Pag3'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // The current/active page link is deliberately styled white-on-teal
    // (see main.css `.pagination a.active`), so assert on a non-active link.
    const paginationLink = page.locator('.pagination a:not(.active)').first();
    await expect(paginationLink).toBeVisible();
    await expect(paginationLink).toHaveCSS('color', 'rgb(0, 105, 92)');
  });
});

// ─── 14. Mobile responsiveness ────────────────────────────────────────────────

test.describe('Mobile responsiveness', () => {
  const MOBILE = { width: 375, height: 812 };

  test('hamburger Menu button is visible on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await expect(page.locator('#side-menu-toggle')).toBeVisible();
  });

  test('desktop nav is hidden on mobile viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await expect(page.locator('.main-header__nav')).toHaveCSS('display', 'none');
  });

  test('mobile nav drawer slides in when Menu button is clicked', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    const mobileNav = page.locator('.mobile-nav');
    // Initially off-screen
    await expect(mobileNav).not.toHaveClass(/open/);

    await page.click('#side-menu-toggle');
    await expect(mobileNav).toHaveClass(/open/);
    // Wait out the 0.3s CSS transition — toHaveCSS auto-retries until it matches
    await expect(mobileNav).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  });

  test('backdrop appears when mobile nav is open', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    const backdrop = page.locator('.backdrop');
    await expect(backdrop).toHaveCSS('display', 'none');
    await page.click('#side-menu-toggle');
    await expect(backdrop).toHaveCSS('display', 'block');
  });

  test('mobile nav closes when backdrop is clicked', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.click('#side-menu-toggle');
    await expect(page.locator('.mobile-nav')).toHaveClass(/open/);
    await page.click('.backdrop');
    await expect(page.locator('.mobile-nav')).not.toHaveClass(/open/);
  });

  test('mobile nav contains Shop and Products links', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.click('#side-menu-toggle');
    await expect(page.locator('.mobile-nav a[href="/"]')).toBeVisible();
    await expect(page.locator('.mobile-nav a[href="/products"]')).toBeVisible();
  });

  test('mobile nav shows Login/Signup when unauthenticated', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.click('#side-menu-toggle');
    await expect(page.locator('.mobile-nav a[href="/login"]')).toBeVisible();
    await expect(page.locator('.mobile-nav a[href="/signup"]')).toBeVisible();
  });

  test('mobile nav shows Cart/Orders/Admin links when authenticated', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await signupAndLogin(page, 'mobile-auth');
    await page.click('#side-menu-toggle');
    await expect(page.locator('.mobile-nav a[href="/cart"]')).toBeVisible();
    await expect(page.locator('.mobile-nav a[href="/orders"]')).toBeVisible();
    await expect(page.locator('.mobile-nav a[href="/admin/add-product"]')).toBeVisible();
  });

  test('desktop nav is visible on wide viewport (≥768 px)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.locator('.main-header__nav')).toHaveCSS('display', 'flex');
  });

  test('hamburger button is hidden on wide viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.locator('#side-menu-toggle')).toHaveCSS('display', 'none');
  });

  test('login form is readable on mobile viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/login');
    await expect(page.locator('.login-form')).toBeVisible();
    const width = await page.locator('.login-form').evaluate(el => (el as HTMLElement).offsetWidth);
    expect(width).toBeLessThanOrEqual(MOBILE.width);
  });

  test('add-product form is readable on mobile viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await signupAndLogin(page, 'mobile-form');
    await page.goto('/admin/add-product');
    await expect(page.locator('.product-form')).toBeVisible();
    const width = await page
      .locator('.product-form')
      .evaluate(el => (el as HTMLElement).offsetWidth);
    expect(width).toBeLessThanOrEqual(MOBILE.width);
  });
});

// ─── 15. Logout ───────────────────────────────────────────────────────────────

test.describe('Logout', () => {
  test('logout clears session and removes authenticated nav items', async ({ page }) => {
    await signupAndLogin(page, 'logout');
    await expect(navLink(page, '/cart')).toBeVisible();

    // On mobile the logout button lives inside the drawer, which is
    // transformed off-screen until the hamburger toggle opens it.
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;
    if (isMobile) {
      await page.click('#side-menu-toggle');
    }

    await navLogoutButton(page).click();
    await page.waitForLoadState('networkidle');
    await expect(navLink(page, '/login')).toBeVisible();
    await expect(navLink(page, '/cart')).toHaveCount(0);
  });
});
