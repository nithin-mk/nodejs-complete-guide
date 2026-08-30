import mongoose, { Document, Schema } from 'mongoose';

export interface ICartItem {
  productId: any;
  quantity: number;
}

export interface IUser extends Document {
  email: string;
  password: string;
  resetToken?: string;
  resetTokenExpiration?: Date;
  cart: { items: ICartItem[] };
  addToCart(product: any): Promise<IUser>;
  removeFromCart(productId: string): Promise<IUser>;
  clearCart(): Promise<IUser>;
}

const userSchema = new Schema({
  email: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  resetToken: String,
  resetTokenExpiration: Date,
  cart: {
    items: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        quantity: { type: Number, required: true }
      }
    ]
  }
});

userSchema.methods.addToCart = function (this: IUser, product: any): Promise<IUser> {
  const cartProductIndex = this.cart.items.findIndex(cp => {
    return cp.productId.toString() === product._id.toString();
  });
  let newQuantity = 1;
  const updatedCartItems = [...this.cart.items];

  if (cartProductIndex >= 0) {
    newQuantity = this.cart.items[cartProductIndex].quantity + 1;
    updatedCartItems[cartProductIndex].quantity = newQuantity;
  } else {
    updatedCartItems.push({
      productId: product._id,
      quantity: newQuantity
    });
  }
  this.cart = { items: updatedCartItems };
  return this.save() as unknown as Promise<IUser>;
};

userSchema.methods.removeFromCart = function (this: IUser, productId: string): Promise<IUser> {
  const updatedCartItems = this.cart.items.filter(item => {
    return item.productId.toString() !== productId.toString();
  });
  this.cart.items = updatedCartItems;
  return this.save() as unknown as Promise<IUser>;
};

userSchema.methods.clearCart = function (this: IUser): Promise<IUser> {
  this.cart = { items: [] };
  return this.save() as unknown as Promise<IUser>;
};

export default mongoose.model<IUser>('User', userSchema);
