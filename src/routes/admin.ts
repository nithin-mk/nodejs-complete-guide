import { Router } from 'express';
import { body } from 'express-validator/check';

import * as adminController from '../controllers/admin';
import isAuth from '../middleware/is-auth';

const router = Router();

const productValidators = [
  body('title').isString().isLength({ min: 3 }).trim(),
  body('price').isFloat(),
  body('description').isLength({ min: 5, max: 400 }).trim()
];

router.get('/add-product', isAuth, adminController.getAddProduct);
router.get('/products', isAuth, adminController.getProducts);
router.post('/add-product', productValidators, isAuth, adminController.postAddProduct);
router.get('/edit-product/:productId', isAuth, adminController.getEditProduct);
router.post('/edit-product', productValidators, isAuth, adminController.postEditProduct);
router.delete('/product/:productId', isAuth, adminController.deleteProduct);

export default router;
