const deleteProduct = (btn: HTMLElement): void => {
  const form = btn.parentNode as HTMLElement;
  const prodId = (form.querySelector('[name=productId]') as HTMLInputElement).value;
  const csrf = (form.querySelector('[name=_csrf]') as HTMLInputElement).value;

  const productElement = btn.closest('article') as HTMLElement;

  fetch('/admin/product/' + prodId, {
    method: 'DELETE',
    headers: { 'csrf-token': csrf }
  })
    .then(res => res.json())
    .then(data => {
      console.log(data);
      productElement.parentNode!.removeChild(productElement);
    })
    .catch(err => console.log(err));
};

(window as any).deleteProduct = deleteProduct;
