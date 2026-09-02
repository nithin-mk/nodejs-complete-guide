import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';

import PDFDocument from 'pdfkit';
import Stripe from 'stripe';

import Product from '../models/product';
import Order from '../models/order';
import { downloadImageIfMissing } from '../util/minio';

const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' })
  : null;

const ITEMS_PER_PAGE = 2;

export const getProducts = (req: Request, res: Response, next: NextFunction): void => {
  const page = +((req.query.page as string) || '1');
  let totalItems: number;

  Product.find()
    .countDocuments()
    .then(numProducts => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then(products => {
      const downloads = products.map(product => downloadImageIfMissing(product.imageUrl));
      return Promise.all(downloads).then(() => {
        res.render('shop/product-list', {
          prods: products,
          pageTitle: 'Products',
          path: '/products',
          currentPage: page,
          hasNextPage: ITEMS_PER_PAGE * page < totalItems,
          hasPreviousPage: page > 1,
          nextPage: page + 1,
          previousPage: page - 1,
          lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
        });
      });
    })
    .catch(err => next(err));
};

export const getProduct = (req: Request, res: Response, next: NextFunction): void => {
  const prodId: string = req.params.productId;
  Product.findById(prodId)
    .then(product => {
      if (!product) return next(new Error('Product not found.'));
      return downloadImageIfMissing(product.imageUrl).then(() => {
        res.render('shop/product-detail', {
          product,
          pageTitle: product.title,
          path: '/products'
        });
      });
    })
    .catch(err => next(err));
};

export const getIndex = (req: Request, res: Response, next: NextFunction): void => {
  const page = +((req.query.page as string) || '1');
  let totalItems: number;

  Product.find()
    .countDocuments()
    .then(numProducts => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then(products => {
      const downloads = products.map(product => downloadImageIfMissing(product.imageUrl));
      return Promise.all(downloads).then(() => {
        res.render('shop/index', {
          prods: products,
          pageTitle: 'Shop',
          path: '/',
          currentPage: page,
          hasNextPage: ITEMS_PER_PAGE * page < totalItems,
          hasPreviousPage: page > 1,
          nextPage: page + 1,
          previousPage: page - 1,
          lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
        });
      });
    })
    .catch(err => next(err));
};

export const getCart = (req: Request, res: Response, next: NextFunction): void => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then((user: any) => {
      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your Cart',
        products: user.cart.items
      });
    })
    .catch(err => next(err));
};

export const postCart = (req: Request, res: Response, next: NextFunction): void => {
  const prodId: string = req.body.productId;
  Product.findById(prodId)
    .then(product => {
      if (!product) {
        next(new Error('Product not found.'));
        return;
      }
      return req.user.addToCart(product);
    })
    .then(() => {
      res.redirect('/cart');
    })
    .catch(err => next(err));
};

export const postCartDeleteProduct = (req: Request, res: Response, next: NextFunction): void => {
  const prodId: string = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then(() => {
      res.redirect('/cart');
    })
    .catch(err => next(err));
};

export const getCheckout = (req: Request, res: Response, next: NextFunction): void => {
  let products: any[];
  let total = 0;

  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then((user: any) => {
      products = user.cart.items;
      products.forEach((p: any) => {
        total += p.quantity * p.productId.price;
      });
      res.render('shop/checkout', {
        path: '/checkout',
        pageTitle: 'Checkout',
        products,
        totalSum: total,
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
        errorMessage: null
      });
    })
    .catch(err => next(err));
};

export const postOrder = (req: Request, res: Response, next: NextFunction): void => {
  const token: string = req.body.stripeToken;

  if (!stripe) {
    res.status(503).render('shop/checkout', {
      path: '/checkout',
      pageTitle: 'Checkout',
      products: [],
      totalSum: 0,
      stripePublishableKey: null,
      errorMessage: 'Payments are not configured.'
    });
    return;
  }

  let totalSum = 0;
  let orderProducts: any[];

  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then((user: any) => {
      user.cart.items.forEach((p: any) => {
        totalSum += p.quantity * p.productId.price;
      });
      orderProducts = user.cart.items.map((i: any) => ({
        quantity: i.quantity,
        product: { ...i.productId._doc }
      }));
      return (stripe as Stripe).charges.create({
        amount: Math.round(totalSum * 100),
        currency: 'usd',
        description: 'Demo Order',
        source: token
      });
    })
    .then(() => {
      // Order is only persisted after Stripe confirms the charge.
      const order = new Order({
        user: { email: req.user.email, userId: req.user },
        products: orderProducts
      });
      return order.save();
    })
    .then(() => req.user.clearCart())
    .then(() => res.redirect('/orders'))
    .catch(err => next(err));
};

export const getOrders = (req: Request, res: Response, next: NextFunction): void => {
  Order.find({ 'user.userId': req.user._id })
    .then(orders => {
      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your Orders',
        orders
      });
    })
    .catch(err => next(err));
};

export const getInvoice = (req: Request, res: Response, next: NextFunction): void => {
  const orderId: string = req.params.orderId;
  Order.findById(orderId)
    .then(order => {
      if (!order) {
        return next(new Error('No order found.'));
      }
      if (order.user.userId.toString() !== req.user._id.toString()) {
        return next(new Error('Unauthorized'));
      }
      const invoiceName = 'invoice-' + orderId + '.pdf';
      const invoicePath = path.join('data', 'invoices', invoiceName);

      const pdfDoc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + invoiceName + '"');
      pdfDoc.pipe(fs.createWriteStream(invoicePath));
      pdfDoc.pipe(res);

      pdfDoc.fontSize(26).text('Invoice', { underline: true });
      pdfDoc.text('-----------------------');
      let totalPrice = 0;
      order.products.forEach(prod => {
        const p = prod.product as any;
        totalPrice += prod.quantity * p.price;
        pdfDoc.fontSize(14).text(p.title + ' - ' + prod.quantity + ' x $' + p.price);
      });
      pdfDoc.text('---');
      pdfDoc.fontSize(20).text('Total Price: $' + totalPrice);
      pdfDoc.end();
    })
    .catch(err => next(err));
};
