import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator/check';

import * as fileHelper from '../util/file';
import Product from '../models/product';
import { minioClient, bucket } from '../util/minio';

export const getAddProduct = (req: Request, res: Response, next: NextFunction): void => {
  res.render('admin/edit-product', {
    pageTitle: 'Add Product',
    path: '/admin/add-product',
    editing: false,
    hasError: false,
    errorMessage: null,
    validationErrors: []
  });
};

export const postAddProduct = (req: Request, res: Response, next: NextFunction): void => {
  const title: string = req.body.title;
  const image = req.file;
  const price: number = req.body.price;
  const description: string = req.body.description;

  if (!image) {
    res.status(422).render('admin/edit-product', {
      pageTitle: 'Add Product',
      path: '/admin/add-product',
      editing: false,
      hasError: true,
      product: { title, price, description },
      errorMessage: 'Attached file is not an image.',
      validationErrors: []
    });
    return;
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors.array());
    res.status(422).render('admin/edit-product', {
      pageTitle: 'Add Product',
      path: '/admin/add-product',
      editing: false,
      hasError: true,
      product: { title, price, description },
      errorMessage: (errors.array()[0] as any).msg,
      validationErrors: errors.array()
    });
    return;
  }

  const imageUrl = `images/${image.filename}`;
  const destinationObject = image.filename;
  const metaData = {
    'Content-Type': image.mimetype,
    'X-Amz-Meta-Testing': '1234',
    example: '5678'
  };

  minioClient.fPutObject(bucket, destinationObject, image.path, metaData)
    .then(etag => {
      console.log('File ' + image.path + ' uploaded as object ' + destinationObject + ' in bucket ' + bucket + ' with ETag ' + etag);
      const product = new Product({
        title,
        price,
        description,
        imageUrl,
        userId: req.user
      });
      return product.save();
    })
    .then(() => {
      console.log('Created Product');
      res.redirect('/admin/products');
    })
    .catch(err => next(err));
};

export const getEditProduct = (req: Request, res: Response, next: NextFunction): void => {
  const editMode = req.query.edit as string;
  if (!editMode) {
    res.redirect('/');
    return;
  }
  const prodId: string = req.params.productId;
  Product.findById(prodId)
    .then(product => {
      if (!product) {
        res.redirect('/');
        return;
      }
      res.render('admin/edit-product', {
        pageTitle: 'Edit Product',
        path: '/admin/edit-product',
        editing: editMode,
        product,
        hasError: false,
        errorMessage: null,
        validationErrors: []
      });
    })
    .catch(err => next(err));
};

export const postEditProduct = (req: Request, res: Response, next: NextFunction): void => {
  const prodId: string = req.body.productId;
  const updatedTitle: string = req.body.title;
  const updatedPrice: number = req.body.price;
  const image = req.file;
  const updatedDesc: string = req.body.description;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).render('admin/edit-product', {
      pageTitle: 'Edit Product',
      path: '/admin/edit-product',
      editing: true,
      hasError: true,
      product: {
        title: updatedTitle,
        price: updatedPrice,
        description: updatedDesc,
        _id: prodId
      },
      errorMessage: (errors.array()[0] as any).msg,
      validationErrors: errors.array(),
      csrfToken: (req as any).csrfToken()
    });
    return;
  }

  Product.findById(prodId)
    .then(product => {
      if (!product) {
        return next(new Error('Product not found.'));
      }
      if (product.userId.toString() !== req.user._id.toString()) {
        res.redirect('/');
        return;
      }
      product.title = updatedTitle;
      product.price = updatedPrice;
      product.description = updatedDesc;

      if (image) {
        const oldImageUrl = product.imageUrl;
        const oldObject = oldImageUrl.split('/')[1];
        minioClient.removeObject(bucket, oldObject)
          .then(() => {
            console.log('Removed old object ' + oldObject);
            const newImageUrl = `images/${image.filename}`;
            const metaData = {
              'Content-Type': image.mimetype,
              'X-Amz-Meta-Testing': '1234',
              example: '5678'
            };
            return minioClient.fPutObject(bucket, image.filename, image.path, metaData);
          })
          .catch(err => console.error(err));

        fileHelper.deleteFile(product.imageUrl);
        product.imageUrl = `images/${image.filename}`;
      }

      return product.save().then(() => {
        console.log('UPDATED PRODUCT!');
        res.redirect('/admin/products');
      });
    })
    .catch(err => next(err));
};

export const getProducts = (req: Request, res: Response, next: NextFunction): void => {
  Product.find({ userId: req.user._id })
    .then(products => {
      console.log(products);
      const downloads = products.map(product => {
        const destinationObject = product.imageUrl.split('/')[1];
        return minioClient.fGetObject(bucket, destinationObject, product.imageUrl).then(() => {
          console.log('Object ' + destinationObject + ' downloaded');
        });
      });
      return Promise.all(downloads).then(() => {
        res.render('admin/products', {
          prods: products,
          pageTitle: 'Admin Products',
          path: '/admin/products'
        });
      });
    })
    .catch(err => next(err));
};

export const deleteProduct = (req: Request, res: Response, next: NextFunction): void => {
  const prodId: string = req.params.productId;
  Product.findById(prodId)
    .then(product => {
      if (!product) {
        return next(new Error('Product not found.'));
      }
      fileHelper.deleteFile(product.imageUrl);
      return Product.deleteOne({ _id: prodId, userId: req.user._id })
        .then(() => {
          const destinationObject = product.imageUrl.split('/')[1];
          return minioClient.removeObject(bucket, destinationObject).then(() => {
            console.log('Removed object ' + destinationObject);
          });
        });
    })
    .then(() => {
      console.log('DESTROYED PRODUCT');
      res.status(200).json({ message: 'Success!' });
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ message: 'Deleting product failed.' });
    });
};
