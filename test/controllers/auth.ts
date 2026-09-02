import { expect } from 'chai';
import * as sinon from 'sinon';
import * as bcrypt from 'bcryptjs';

// bcryptjs exports are non-writable — use real hashing with cost=1 for speed

import User from '../../src/models/user';
import * as AuthController from '../../src/controllers/auth';

function makeReq(overrides: any = {}): any {
  return Object.assign(
    {
      body: { email: 'test@test.com', password: 'tester' },
      flash: () => [],
      session: {}
    },
    overrides
  );
}

function makeRes() {
  let code: number;
  const res: any = {
    status(c: number) {
      code = c;
      return res;
    },
    render: sinon.spy(),
    redirect: sinon.spy(),
    statusCode() {
      return code;
    }
  };
  return res;
}

afterEach(function () {
  sinon.restore();
});

// ── postLogin ──────────────────────────────────────────────────────────────

describe('Auth Controller - postLogin', function () {
  it('should call next with an error when the database lookup fails', function (done) {
    sinon.stub(User, 'findOne').returns(Promise.reject(new Error('DB error')) as any);
    AuthController.postLogin(makeReq(), makeRes(), (err: any) => {
      expect(err).to.be.an('error');
      done();
    });
  });

  it('should 422 render login when user is not found', function (done) {
    sinon.stub(User, 'findOne').returns(Promise.resolve(null) as any);
    const res = makeRes();
    res.render = function (view: string) {
      expect(res.statusCode()).to.equal(422);
      expect(view).to.equal('auth/login');
      done();
    };
    AuthController.postLogin(makeReq(), res, () => {});
  });

  it('should 422 render login when validation middleware attaches errors', function () {
    const req = makeReq({
      _validationErrors: [
        { param: 'email', msg: 'Enter a valid email', value: '', location: 'body' }
      ]
    });
    const res = makeRes();
    AuthController.postLogin(req, res, () => {});
    expect(res.render.calledWith('auth/login')).to.be.true;
  });

  it('should redirect to / after successful login', function (done) {
    const password = 'tester';
    const hash = bcrypt.hashSync(password, 1);
    sinon
      .stub(User, 'findOne')
      .returns(Promise.resolve({ password: hash, _id: 'u1', email: 'test@test.com' }) as any);
    const req = makeReq({
      body: { email: 'test@test.com', password },
      session: { save: (cb: (e: any) => void) => cb(null) }
    });
    const res = makeRes();
    res.redirect = function (path: string) {
      expect(path).to.equal('/');
      done();
    };
    AuthController.postLogin(req, res, () => {});
  });

  it('should 422 render login when password does not match', function (done) {
    const hash = bcrypt.hashSync('other-password', 1);
    sinon.stub(User, 'findOne').returns(Promise.resolve({ password: hash, _id: 'u1' }) as any);
    const res = makeRes();
    res.render = function (view: string) {
      expect(res.statusCode()).to.equal(422);
      expect(view).to.equal('auth/login');
      done();
    };
    AuthController.postLogin(makeReq(), res, () => {});
  });
});

// ── getLogin / getSignup / getReset ────────────────────────────────────────

describe('Auth Controller - GET pages', function () {
  it('getLogin should render auth/login with null errorMessage when flash is empty', function () {
    const res = makeRes();
    AuthController.getLogin(makeReq(), res, () => {});
    expect(res.render.firstCall.args[0]).to.equal('auth/login');
    expect(res.render.firstCall.args[1].errorMessage).to.be.null;
  });

  it('getLogin should pass flash error message when present', function () {
    const req = makeReq({ flash: (key: string) => (key === 'error' ? ['Bad credentials'] : []) });
    const res = makeRes();
    AuthController.getLogin(req, res, () => {});
    expect(res.render.firstCall.args[1].errorMessage).to.equal('Bad credentials');
  });

  it('getSignup should render auth/signup', function () {
    const res = makeRes();
    AuthController.getSignup(makeReq(), res, () => {});
    expect(res.render.firstCall.args[0]).to.equal('auth/signup');
  });

  it('getReset should render auth/reset', function () {
    const res = makeRes();
    AuthController.getReset(makeReq(), res, () => {});
    expect(res.render.firstCall.args[0]).to.equal('auth/reset');
  });
});

// ── postSignup ─────────────────────────────────────────────────────────────

describe('Auth Controller - postSignup', function () {
  it('should 422 render signup when validation errors present', function () {
    const req = makeReq({
      body: { email: 'bad', password: '', confirmPassword: '' },
      _validationErrors: [
        { param: 'email', msg: 'Enter a valid email', value: 'bad', location: 'body' }
      ]
    });
    const res = makeRes();
    AuthController.postSignup(req, res, () => {});
    expect(res.render.calledWith('auth/signup')).to.be.true;
  });

  it('should redirect to /login after successful signup', function (done) {
    sinon.stub(User.prototype, 'save').returns(Promise.resolve() as any);
    const req = makeReq({
      body: { email: 'new@test.com', password: 'password123', confirmPassword: 'password123' }
    });
    const res = makeRes();
    res.redirect = function (path: string) {
      expect(path).to.equal('/login');
      done();
    };
    AuthController.postSignup(req, res, () => {});
  });

  it('should call next when save throws', function (done) {
    sinon.stub(User.prototype, 'save').returns(Promise.reject(new Error('save fail')) as any);
    AuthController.postSignup(
      makeReq({ body: { email: 'x@x.com', password: 'pw', confirmPassword: 'pw' } }),
      makeRes(),
      (err: any) => {
        expect(err).to.be.an('error');
        done();
      }
    );
  });
});

// ── getNewPassword ─────────────────────────────────────────────────────────

describe('Auth Controller - getNewPassword', function () {
  it('should render auth/new-password when token is valid', function (done) {
    const fakeUser = { _id: { toString: () => 'u1' }, flash: () => [] };
    sinon.stub(User, 'findOne').returns(Promise.resolve(fakeUser) as any);
    const req = makeReq({ params: { token: 'validtoken' } });
    const res = makeRes();
    res.render = function (view: string) {
      expect(view).to.equal('auth/new-password');
      done();
    };
    AuthController.getNewPassword(req, res, () => {});
  });

  it('should call next with error when token is invalid', function (done) {
    sinon.stub(User, 'findOne').returns(Promise.resolve(null) as any);
    const req = makeReq({ params: { token: 'badtoken' } });
    AuthController.getNewPassword(req, makeRes(), (err: any) => {
      expect(err).to.be.an('error');
      done();
    });
  });
});

// ── postLogout ─────────────────────────────────────────────────────────────

describe('Auth Controller - postLogout', function () {
  it('should destroy the session and redirect to /', function (done) {
    const req = makeReq({ session: { destroy: (cb: (e: any) => void) => cb(null) } });
    const res = makeRes();
    res.redirect = function (path: string) {
      expect(path).to.equal('/');
      done();
    };
    AuthController.postLogout(req, res, () => {});
  });
});

// ── postReset ──────────────────────────────────────────────────────────────
// crypto.randomBytes is non-configurable so we let it run naturally

describe('Auth Controller - postReset', function () {
  it('should redirect to /reset when user email is not found', function (done) {
    sinon.stub(User, 'findOne').returns(Promise.resolve(null) as any);
    const req = makeReq({ body: { email: 'notfound@test.com' }, flash: sinon.spy() });
    const res = makeRes();
    res.redirect = function (path: string) {
      expect(path).to.equal('/reset');
      done();
    };
    AuthController.postReset(req, res, () => {});
  });

  it('should redirect to / when user is found and save succeeds', function (done) {
    const fakeUser = {
      resetToken: '' as any,
      resetTokenExpiration: null as any,
      save: sinon.stub().resolves()
    };
    sinon.stub(User, 'findOne').returns(Promise.resolve(fakeUser) as any);
    const req = makeReq({ body: { email: 'found@test.com' } });
    const res = makeRes();
    res.redirect = function (path: string) {
      expect(path).to.equal('/');
      done();
    };
    AuthController.postReset(req, res, () => {});
  });
});

// ── postNewPassword ────────────────────────────────────────────────────────

describe('Auth Controller - postNewPassword', function () {
  it('should redirect to /login after a successful password reset', function (done) {
    const fakeUser = {
      password: 'old',
      resetToken: undefined,
      resetTokenExpiration: undefined,
      save: sinon.stub().resolves()
    };
    sinon.stub(User, 'findOne').returns(Promise.resolve(fakeUser) as any);
    const req = makeReq({
      body: { password: 'newpassword123', userId: 'u1', passwordToken: 'tok' }
    });
    const res = makeRes();
    res.redirect = function (path: string) {
      expect(path).to.equal('/login');
      done();
    };
    AuthController.postNewPassword(req, res, () => {});
  });

  it('should call next when findOne rejects in postNewPassword', function (done) {
    sinon.stub(User, 'findOne').returns(Promise.reject(new Error('db error')) as any);
    AuthController.postNewPassword(
      makeReq({ body: { password: 'pw', userId: 'u1', passwordToken: 'tok' } }),
      makeRes(),
      (err: any) => {
        expect(err).to.be.an('error');
        done();
      }
    );
  });
});
