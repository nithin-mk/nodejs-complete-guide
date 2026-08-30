import { expect } from 'chai';
import * as sinon from 'sinon';

import isAuth from '../../src/middleware/is-auth';

describe('Auth middleware', function () {
  it('should redirect to /login when session is not logged in', function () {
    const redirectSpy = sinon.spy();
    const req: any = { session: {} };
    const res: any = { redirect: redirectSpy };
    const next = sinon.spy();

    isAuth(req, res, next);

    expect(redirectSpy.calledOnce).to.be.true;
    expect(redirectSpy.calledWith('/login')).to.be.true;
    expect(next.called).to.be.false;
  });

  it('should redirect to /login when isLoggedIn is explicitly false', function () {
    const redirectSpy = sinon.spy();
    const req: any = { session: { isLoggedIn: false } };
    const res: any = { redirect: redirectSpy };
    const next = sinon.spy();

    isAuth(req, res, next);

    expect(redirectSpy.calledWith('/login')).to.be.true;
  });

  it('should call next() when the session is logged in', function () {
    const req: any = { session: { isLoggedIn: true } };
    const res: any = {};
    const next = sinon.spy();

    isAuth(req, res, next);

    expect(next.calledOnce).to.be.true;
  });
});
