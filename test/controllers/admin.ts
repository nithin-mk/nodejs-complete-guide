import { expect } from 'chai';
import * as sinon from 'sinon';

import Product from '../../src/models/product';
import { minioClient } from '../../src/util/minio';
import * as AdminController from '../../src/controllers/admin';

afterEach(function () {
  sinon.restore();
});

// ── getAddProduct ───────────────────────────────────────────────────────────

describe('Admin Controller - getAddProduct', function () {
  it('should render admin/edit-product with editing=false', function () {
    const renderSpy = sinon.spy();
    AdminController.getAddProduct({} as any, { render: renderSpy } as any, () => {});
    expect(renderSpy.calledOnce).to.be.true;
    expect(renderSpy.firstCall.args[0]).to.equal('admin/edit-product');
    expect(renderSpy.firstCall.args[1].editing).to.be.false;
  });
});

// ── postAddProduct ──────────────────────────────────────────────────────────

describe('Admin Controller - postAddProduct', function () {
  it('should 422 render when no image is attached', function () {
    const res: any = { status: sinon.stub().returnsThis(), render: sinon.spy() };
    AdminController.postAddProduct(
      { body: { title: 'T', price: 10, description: 'D' }, file: undefined } as any,
      res,
      () => {}
    );
    expect(res.status.calledWith(422)).to.be.true;
    expect(res.render.calledWith('admin/edit-product')).to.be.true;
  });

  it('should 422 render when validation errors are present', function () {
    const res: any = { status: sinon.stub().returnsThis(), render: sinon.spy() };
    const req: any = {
      body: { title: '', price: 0, description: '' },
      file: { filename: 'x.jpg', path: '/tmp/x.jpg', mimetype: 'image/jpeg' },
      _validationErrors: [
        { param: 'title', msg: 'Title is required.', value: '', location: 'body' }
      ]
    };
    AdminController.postAddProduct(req, res, () => {});
    expect(res.status.calledWith(422)).to.be.true;
    expect(res.render.calledWith('admin/edit-product')).to.be.true;
  });

  it('should upload to MinIO, save product, and redirect to /admin/products', function (done) {
    sinon.stub(minioClient, 'fPutObject').resolves('etag-abc' as any);
    sinon.stub(Product.prototype, 'save').resolves();
    const res: any = { redirect: sinon.spy() };
    const req: any = {
      body: { title: 'Widget', price: '9.99', description: 'A widget' },
      file: { filename: 'widget.jpg', path: '/tmp/widget.jpg', mimetype: 'image/jpeg' },
      user: { _id: 'u1' }
    };
    AdminController.postAddProduct(req, res, () => {});
    setTimeout(() => {
      expect(res.redirect.calledWith('/admin/products')).to.be.true;
      done();
    }, 20);
  });

  it('should call next when MinIO upload fails', function (done) {
    sinon.stub(minioClient, 'fPutObject').rejects(new Error('minio fail'));
    const req: any = {
      body: { title: 'Widget', price: 5, description: 'D' },
      file: { filename: 'widget.jpg', path: '/tmp/widget.jpg', mimetype: 'image/jpeg' },
      user: { _id: 'u1' }
    };
    AdminController.postAddProduct(req, {} as any, (err: any) => {
      expect(err).to.be.an('error');
      done();
    });
  });
});

// ── getEditProduct ──────────────────────────────────────────────────────────

describe('Admin Controller - getEditProduct', function () {
  it('should redirect to / when edit mode is not set', function () {
    const res: any = { redirect: sinon.spy() };
    AdminController.getEditProduct(
      { query: {}, params: { productId: 'p1' } } as any,
      res,
      () => {}
    );
    expect(res.redirect.calledWith('/')).to.be.true;
  });

  it('should redirect to / when product is not found', function (done) {
    sinon.stub(Product, 'findById').returns(Promise.resolve(null) as any);
    const res: any = { redirect: sinon.spy() };
    AdminController.getEditProduct(
      { query: { edit: 'true' }, params: { productId: 'p1' } } as any,
      res,
      () => {}
    );
    setTimeout(() => {
      expect(res.redirect.calledWith('/')).to.be.true;
      done();
    }, 10);
  });

  it('should render admin/edit-product when product is found', function (done) {
    const fakeProduct = {
      _id: 'p1',
      title: 'Widget',
      price: 9.99,
      description: 'A',
      imageUrl: 'images/x.jpg'
    };
    sinon.stub(Product, 'findById').returns(Promise.resolve(fakeProduct) as any);
    const res: any = { render: sinon.spy() };
    AdminController.getEditProduct(
      { query: { edit: 'true' }, params: { productId: 'p1' } } as any,
      res,
      () => {}
    );
    setTimeout(() => {
      expect(res.render.calledWith('admin/edit-product')).to.be.true;
      expect(res.render.firstCall.args[1].product).to.deep.equal(fakeProduct);
      done();
    }, 10);
  });

  it('should call next when DB rejects', function (done) {
    sinon.stub(Product, 'findById').returns(Promise.reject(new Error('db')) as any);
    AdminController.getEditProduct(
      { query: { edit: 'true' }, params: { productId: 'p1' } } as any,
      {} as any,
      (err: any) => {
        expect(err).to.be.an('error');
        done();
      }
    );
  });
});

// ── postEditProduct ─────────────────────────────────────────────────────────

describe('Admin Controller - postEditProduct', function () {
  it('should 422 render when validation errors are present', function () {
    const res: any = { status: sinon.stub().returnsThis(), render: sinon.spy() };
    const req: any = {
      body: { productId: 'p1', title: '', price: 0, description: '' },
      file: undefined,
      _validationErrors: [
        { param: 'title', msg: 'Title is required.', value: '', location: 'body' }
      ],
      csrfToken: () => 'token'
    };
    AdminController.postEditProduct(req, res, () => {});
    expect(res.status.calledWith(422)).to.be.true;
    expect(res.render.calledWith('admin/edit-product')).to.be.true;
  });

  it('should call next when product is not found', function (done) {
    sinon.stub(Product, 'findById').returns(Promise.resolve(null) as any);
    const res: any = {
      status: sinon.stub().returnsThis(),
      json: sinon.spy(),
      redirect: sinon.spy()
    };
    const req: any = {
      body: { productId: 'p1', title: 'W', price: 5, description: 'D' },
      file: undefined,
      user: { _id: { toString: () => 'u1' } }
    };
    let called = false;
    AdminController.postEditProduct(req, res, (err: any) => {
      if (!called) {
        called = true;
        expect(err).to.be.an('error');
        done();
      }
    });
  });

  it('should redirect to / when userId does not match', function (done) {
    const fakeProduct = {
      _id: 'p1',
      userId: { toString: () => 'other-user' },
      title: 'Old',
      price: 5,
      description: 'D',
      imageUrl: 'images/x.jpg',
      save: sinon.stub().resolves()
    };
    sinon.stub(Product, 'findById').returns(Promise.resolve(fakeProduct) as any);
    const res: any = { redirect: sinon.spy() };
    const req: any = {
      body: { productId: 'p1', title: 'New', price: 10, description: 'D' },
      file: undefined,
      user: { _id: { toString: () => 'u1' } }
    };
    AdminController.postEditProduct(req, res, () => {});
    setTimeout(() => {
      expect(res.redirect.calledWith('/')).to.be.true;
      done();
    }, 10);
  });

  it('should save and redirect to /admin/products when no image replacement', function (done) {
    const fakeProduct = {
      _id: 'p1',
      userId: { toString: () => 'u1' },
      title: 'Old',
      price: 5,
      description: 'D',
      imageUrl: 'images/x.jpg',
      save: sinon.stub().resolves()
    };
    sinon.stub(Product, 'findById').returns(Promise.resolve(fakeProduct) as any);
    const res: any = { redirect: sinon.spy() };
    const req: any = {
      body: { productId: 'p1', title: 'New', price: 10, description: 'Updated' },
      file: undefined,
      user: { _id: { toString: () => 'u1' } }
    };
    AdminController.postEditProduct(req, res, () => {});
    setTimeout(() => {
      expect(fakeProduct.title).to.equal('New');
      expect(res.redirect.calledWith('/admin/products')).to.be.true;
      done();
    }, 20);
  });

  it('should remove old MinIO object and upload new one when image is replaced', function (done) {
    const fakeProduct = {
      _id: 'p1',
      userId: { toString: () => 'u1' },
      title: 'Old',
      price: 5,
      description: 'D',
      imageUrl: 'images/old.jpg',
      save: sinon.stub().resolves()
    };
    sinon.stub(Product, 'findById').returns(Promise.resolve(fakeProduct) as any);
    const removeStub = sinon.stub(minioClient, 'removeObject').resolves();
    sinon.stub(minioClient, 'fPutObject').resolves('etag' as any);
    const res: any = { redirect: sinon.spy() };
    const req: any = {
      body: { productId: 'p1', title: 'New', price: 10, description: 'D' },
      file: { filename: 'new.jpg', path: '/tmp/new.jpg', mimetype: 'image/jpeg' },
      user: { _id: { toString: () => 'u1' } }
    };
    AdminController.postEditProduct(req, res, () => {});
    setTimeout(() => {
      expect(removeStub.called).to.be.true;
      expect(res.redirect.calledWith('/admin/products')).to.be.true;
      done();
    }, 30);
  });
});

// ── getProducts ─────────────────────────────────────────────────────────────

describe('Admin Controller - getProducts', function () {
  it('should render admin/products with empty list when no products', function (done) {
    sinon.stub(Product, 'find').returns(Promise.resolve([]) as any);
    AdminController.getProducts(
      { user: { _id: 'u1' } } as any,
      {
        render(view: string, locals: any) {
          expect(view).to.equal('admin/products');
          expect(locals.prods).to.deep.equal([]);
          done();
        }
      } as any,
      () => {}
    );
  });

  it('should download from MinIO and render products', function (done) {
    const fakeProduct = { _id: 'p1', imageUrl: 'images/photo.jpg' };
    sinon.stub(Product, 'find').returns(Promise.resolve([fakeProduct]) as any);
    sinon.stub(minioClient, 'fGetObject').resolves();
    AdminController.getProducts(
      { user: { _id: 'u1' } } as any,
      {
        render(view: string, locals: any) {
          expect(view).to.equal('admin/products');
          expect(locals.prods).to.have.length(1);
          done();
        }
      } as any,
      () => {}
    );
  });

  it('should call next when DB rejects', function (done) {
    sinon.stub(Product, 'find').returns(Promise.reject(new Error('db')) as any);
    AdminController.getProducts({ user: { _id: 'u1' } } as any, {} as any, (err: any) => {
      expect(err).to.be.an('error');
      done();
    });
  });
});

// ── deleteProduct ───────────────────────────────────────────────────────────

describe('Admin Controller - deleteProduct', function () {
  it('should call next when product is not found', function (done) {
    sinon.stub(Product, 'findById').returns(Promise.resolve(null) as any);
    // outer .then still fires after next() so provide working res stubs
    const res: any = { status: sinon.stub().returnsThis(), json: sinon.spy() };
    let called = false;
    AdminController.deleteProduct(
      { params: { productId: 'p1' }, user: { _id: 'u1' } } as any,
      res,
      (err: any) => {
        if (!called) {
          called = true;
          expect(err).to.be.an('error');
          done();
        }
      }
    );
  });

  it('should delete file, remove from DB, remove from MinIO, and respond 200', function (done) {
    const fakeProduct = { _id: 'p1', imageUrl: 'images/photo.jpg', userId: 'u1' };
    sinon.stub(Product, 'findById').returns(Promise.resolve(fakeProduct) as any);
    sinon.stub(Product, 'deleteOne').returns(Promise.resolve({}) as any);
    sinon.stub(minioClient, 'removeObject').resolves();
    const jsonSpy = sinon.spy();
    const res: any = { status: sinon.stub().returnsThis(), json: jsonSpy };
    AdminController.deleteProduct(
      { params: { productId: 'p1' }, user: { _id: 'u1' } } as any,
      res,
      () => {}
    );
    setTimeout(() => {
      expect(jsonSpy.calledWith({ message: 'Success!' })).to.be.true;
      done();
    }, 30);
  });

  it('should respond 500 when an error occurs', function (done) {
    sinon.stub(Product, 'findById').returns(Promise.reject(new Error('db error')) as any);
    const jsonSpy = sinon.spy();
    const res: any = { status: sinon.stub().returnsThis(), json: jsonSpy };
    AdminController.deleteProduct(
      { params: { productId: 'p1' }, user: { _id: 'u1' } } as any,
      res,
      () => {}
    );
    setTimeout(() => {
      expect(jsonSpy.calledWith({ message: 'Deleting product failed.' })).to.be.true;
      done();
    }, 10);
  });
});
