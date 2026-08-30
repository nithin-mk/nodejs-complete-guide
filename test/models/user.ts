import { expect } from 'chai';
import * as sinon from 'sinon';
import mongoose from 'mongoose';

import User from '../../src/models/user';

describe('User Model', function () {
  let user: any;

  beforeEach(function () {
    user = new User({ email: 'test@test.com', password: 'secret', cart: { items: [] } });
    sinon.stub(user, 'save').resolves(user);
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('addToCart', function () {
    it('should add a new product when cart is empty', async function () {
      const product = { _id: new mongoose.Types.ObjectId(), price: 10 };
      await user.addToCart(product);
      expect(user.cart.items).to.have.length(1);
      expect(user.cart.items[0].quantity).to.equal(1);
    });

    it('should increment quantity when product already in cart', async function () {
      const productId = new mongoose.Types.ObjectId();
      user.cart.items = [{ productId, quantity: 2 }];
      await user.addToCart({ _id: productId });
      expect(user.cart.items).to.have.length(1);
      expect(user.cart.items[0].quantity).to.equal(3);
    });

    it('should add a second distinct product alongside existing items', async function () {
      const existingId = new mongoose.Types.ObjectId();
      const newId = new mongoose.Types.ObjectId();
      user.cart.items = [{ productId: existingId, quantity: 1 }];
      await user.addToCart({ _id: newId });
      expect(user.cart.items).to.have.length(2);
    });
  });

  describe('removeFromCart', function () {
    it('should remove the matching product from the cart', async function () {
      const productId = new mongoose.Types.ObjectId();
      user.cart.items = [{ productId, quantity: 2 }];
      await user.removeFromCart(productId.toString());
      expect(user.cart.items).to.have.length(0);
    });

    it('should leave other products intact when removing one', async function () {
      const removeId = new mongoose.Types.ObjectId();
      const keepId = new mongoose.Types.ObjectId();
      user.cart.items = [{ productId: removeId, quantity: 1 }, { productId: keepId, quantity: 3 }];
      await user.removeFromCart(removeId.toString());
      expect(user.cart.items).to.have.length(1);
      expect(user.cart.items[0].productId.toString()).to.equal(keepId.toString());
    });
  });

  describe('clearCart', function () {
    it('should empty all cart items', async function () {
      user.cart.items = [
        { productId: new mongoose.Types.ObjectId(), quantity: 1 },
        { productId: new mongoose.Types.ObjectId(), quantity: 3 }
      ];
      await user.clearCart();
      expect(user.cart.items).to.have.length(0);
    });
  });
});
