declare module 'nodemailer-sendgrid-transport' {
  import { Transport } from 'nodemailer';
  interface SendgridOptions {
    auth: { api_key: string };
  }
  function sendgridTransport(options: SendgridOptions): Transport;
  export = sendgridTransport;
}
