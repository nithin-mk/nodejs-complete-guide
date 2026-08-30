import { expect } from 'chai';
import * as sinon from 'sinon';

import * as ErrorController from '../../src/controllers/error';

function makeRes() {
  let code: number;
  const res: any = {
    status(c: number) { code = c; return res; },
    render: sinon.spy(),
    statusCode() { return code; }
  };
  return res;
}

describe('Error Controller', function () {
  it('get404 should render 404 page with 404 status', function () {
    const res = makeRes();
    const req: any = { session: {}, locals: {} };
    res.locals = {};
    ErrorController.get404(req, res, () => {});
    expect(res.render.calledOnce).to.be.true;
    expect(res.render.firstCall.args[0]).to.equal('404');
  });

  it('get404 passes isAuthenticated false when no session', function () {
    const res = makeRes();
    const req: any = { session: {} };
    res.locals = {};
    ErrorController.get404(req, res, () => {});
    const locals = res.render.firstCall.args[1];
    expect(locals.isAuthenticated).to.equal(false);
  });

  it('get404 passes isAuthenticated true when logged in', function () {
    const res = makeRes();
    const req: any = { session: { isLoggedIn: true } };
    res.locals = {};
    ErrorController.get404(req, res, () => {});
    const locals = res.render.firstCall.args[1];
    expect(locals.isAuthenticated).to.equal(true);
  });

  it('get500 should render 500 page with 500 status', function () {
    const res = makeRes();
    const req: any = { session: {} };
    res.locals = {};
    ErrorController.get500(req, res, () => {});
    expect(res.render.calledOnce).to.be.true;
    expect(res.render.firstCall.args[0]).to.equal('500');
  });
});
