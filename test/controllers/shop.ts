import { expect } from 'chai';
import * as sinon from 'sinon';

import Order from '../../src/models/order';
import Product from '../../src/models/product';
import { minioClient } from '../../src/util/minio';
import * as ShopController from '../../src/controllers/shop';

afterEach(function () { sinon.restore(); });

// ── helpers ────────────────────────────────────────────────────────────────

function stubEmptyProductQuery() {
  const findStub = sinon.stub(Product, 'find');
  findStub.onCall(0).returns({ countDocuments: sinon.stub().resolves(0) } as any);
  findStub.onCall(1).returns({ skip: sinon.stub().returns({ limit: sinon.stub().resolves([]) }) } as any);
  return findStub;
}

// ── getOrders ──────────────────────────────────────────────────────────────

describe('Shop Controller - getOrders', function () {
  it('should call next with an error when the database lookup fails', function (done) {
    sinon.stub(Order, 'find').returns(Promise.reject(new Error('DB error')) as any);
    ShopController.getOrders({ user: { _id: 'abc' } } as any, {} as any, (err: any) => {
      expect(err).to.be.an('error');
      done();
    });
  });

  it('should render the orders view with the fetched orders', function (done) {
    const fakeOrders = [{ _id: 'o1', products: [], user: { email: 'a@b.com' } }];
    sinon.stub(Order, 'find').returns(Promise.resolve(fakeOrders) as any);
    ShopController.getOrders({ user: { _id: 'abc' } } as any, {
      render(view: string, locals: any) {
        expect(view).to.equal('shop/orders');
        expect(locals.orders).to.deep.equal(fakeOrders);
        done();
      }
    } as any, () => {});
  });
});

// ── getIndex ───────────────────────────────────────────────────────────────

describe('Shop Controller - getIndex', function () {
  it('should render shop/index with no products when DB is empty', function (done) {
    stubEmptyProductQuery();
    ShopController.getIndex({ query: {} } as any, {
      render(view: string, locals: any) {
        expect(view).to.equal('shop/index');
        expect(locals.prods).to.deep.equal([]);
        done();
      }
    } as any, () => {});
  });

  it('should download from MinIO and render when products exist', function (done) {
    const fakeProduct = { _id: 'p1', imageUrl: 'images/photo.jpg' };
    const findStub = sinon.stub(Product, 'find');
    findStub.onCall(0).returns({ countDocuments: sinon.stub().resolves(1) } as any);
    findStub.onCall(1).returns({ skip: sinon.stub().returns({ limit: sinon.stub().resolves([fakeProduct]) }) } as any);
    sinon.stub(minioClient, 'fGetObject').resolves();
    ShopController.getIndex({ query: {} } as any, {
      render(view: string, locals: any) {
        expect(view).to.equal('shop/index');
        expect(locals.prods).to.have.length(1);
        done();
      }
    } as any, () => {});
  });

  it('should call next when Product.find rejects', function (done) {
    sinon.stub(Product, 'find').returns({ countDocuments: sinon.stub().rejects(new Error('db')) } as any);
    ShopController.getIndex({ query: {} } as any, {} as any, (err: any) => {
      expect(err).to.be.an('error');
      done();
    });
  });
});

// ── getProducts ────────────────────────────────────────────────────────────

describe('Shop Controller - getProducts', function () {
  it('should render shop/product-list with no products when DB is empty', function (done) {
    stubEmptyProductQuery();
    ShopController.getProducts({ query: {} } as any, {
      render(view: string, locals: any) {
        expect(view).to.equal('shop/product-list');
        expect(locals.prods).to.deep.equal([]);
        done();
      }
    } as any, () => {});
  });

  it('should download from MinIO and render when products exist', function (done) {
    const fakeProduct = { _id: 'p1', imageUrl: 'images/photo.jpg' };
    const findStub = sinon.stub(Product, 'find');
    findStub.onCall(0).returns({ countDocuments: sinon.stub().resolves(1) } as any);
    findStub.onCall(1).returns({ skip: sinon.stub().returns({ limit: sinon.stub().resolves([fakeProduct]) }) } as any);
    sinon.stub(minioClient, 'fGetObject').resolves();
    ShopController.getProducts({ query: {} } as any, {
      render(view: string, locals: any) {
        expect(view).to.equal('shop/product-list');
        expect(locals.prods).to.have.length(1);
        done();
      }
    } as any, () => {});
  });

  it('should call next when countDocuments rejects', function (done) {
    sinon.stub(Product, 'find').returns({ countDocuments: sinon.stub().rejects(new Error('db')) } as any);
    ShopController.getProducts({ query: {} } as any, {} as any, (err: any) => {
      expect(err).to.be.an('error');
      done();
    });
  });
});

// ── getProduct ─────────────────────────────────────────────────────────────

describe('Shop Controller - getProduct', function () {
  it('should render product detail when product is found', function (done) {
    const fakeProduct = { _id: 'p1', title: 'Widget', imageUrl: 'images/photo.jpg' };
    sinon.stub(Product, 'findById').returns(Promise.resolve(fakeProduct) as any);
    sinon.stub(minioClient, 'fGetObject').resolves();
    ShopController.getProduct({ params: { productId: 'p1' } } as any, {
      render(view: string, locals: any) {
        expect(view).to.equal('shop/product-detail');
        expect(locals.product).to.deep.equal(fakeProduct);
        done();
      }
    } as any, () => {});
  });

  it('should call next when product is not found', function (done) {
    sinon.stub(Product, 'findById').returns(Promise.resolve(null) as any);
    ShopController.getProduct({ params: { productId: 'bad' } } as any, {} as any, (err: any) => {
      expect(err).to.be.an('error');
      done();
    });
  });
});

// ── getCart ────────────────────────────────────────────────────────────────

describe('Shop Controller - getCart', function () {
  it('should render cart with the user cart items', function (done) {
    const fakeItems = [{ productId: { title: 'Widget', price: 9.99 }, quantity: 2 }];
    ShopController.getCart({
      user: { populate: () => ({ execPopulate: () => Promise.resolve({ cart: { items: fakeItems } }) }) }
    } as any, {
      render(view: string, locals: any) {
        expect(view).to.equal('shop/cart');
        expect(locals.products).to.deep.equal(fakeItems);
        done();
      }
    } as any, () => {});
  });

  it('should call next when populate rejects', function (done) {
    ShopController.getCart({
      user: { populate: () => ({ execPopulate: () => Promise.reject(new Error('db')) }) }
    } as any, {} as any, (err: any) => {
      expect(err).to.be.an('error');
      done();
    });
  });
});

// ── postCart ───────────────────────────────────────────────────────────────

describe('Shop Controller - postCart', function () {
  it('should add product to cart and redirect to /cart', function (done) {
    const fakeProduct = { _id: 'p1', title: 'Widget', price: 5 };
    sinon.stub(Product, 'findById').returns(Promise.resolve(fakeProduct) as any);
    const addToCartStub = sinon.stub().resolves();
    const req: any = { body: { productId: 'p1' }, user: { addToCart: addToCartStub } };
    const res: any = { redirect: sinon.spy() };
    ShopController.postCart(req, res, () => {});
    setTimeout(() => {
      expect(addToCartStub.calledWith(fakeProduct)).to.be.true;
      expect(res.redirect.calledWith('/cart')).to.be.true;
      done();
    }, 20);
  });

  it('should call next when product is not found', function (done) {
    sinon.stub(Product, 'findById').returns(Promise.resolve(null) as any);
    // provide redirect stub so the second .then() doesn't throw a second error
    const res: any = { redirect: sinon.spy() };
    let callCount = 0;
    ShopController.postCart({ body: { productId: 'p1' }, user: {} } as any, res, (err: any) => {
      if (callCount++ === 0) { expect(err).to.be.an('error'); done(); }
    });
  });
});

// ── postCartDeleteProduct ──────────────────────────────────────────────────

describe('Shop Controller - postCartDeleteProduct', function () {
  it('should remove from cart and redirect to /cart', function (done) {
    const removeStub = sinon.stub().resolves();
    const res: any = { redirect: sinon.spy() };
    ShopController.postCartDeleteProduct({ body: { productId: 'p1' }, user: { removeFromCart: removeStub } } as any, res, () => {});
    setImmediate(() => {
      expect(removeStub.calledWith('p1')).to.be.true;
      expect(res.redirect.calledWith('/cart')).to.be.true;
      done();
    });
  });
});

// ── getCheckout ────────────────────────────────────────────────────────────

describe('Shop Controller - getCheckout', function () {
  it('should render checkout with totalSum 0 for empty cart', function (done) {
    ShopController.getCheckout({
      user: { populate: () => ({ execPopulate: () => Promise.resolve({ cart: { items: [] } }) }) }
    } as any, {
      render(view: string, locals: any) {
        expect(view).to.equal('shop/checkout');
        expect(locals.totalSum).to.equal(0);
        done();
      }
    } as any, () => {});
  });

  it('should sum product totals correctly', function (done) {
    const fakeItems = [
      { productId: { price: 10 }, quantity: 2 },
      { productId: { price: 5 }, quantity: 1 }
    ];
    ShopController.getCheckout({
      user: { populate: () => ({ execPopulate: () => Promise.resolve({ cart: { items: fakeItems } }) }) }
    } as any, {
      render(_view: string, locals: any) {
        expect(locals.totalSum).to.equal(25);
        done();
      }
    } as any, () => {});
  });
});
