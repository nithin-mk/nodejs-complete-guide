const backdrop = document.querySelector('.backdrop') as HTMLElement;
const sideDrawer = document.querySelector('.mobile-nav') as HTMLElement;
const menuToggle = document.querySelector('#side-menu-toggle') as HTMLElement;

function backdropClickHandler(): void {
  backdrop.style.display = 'none';
  sideDrawer.classList.remove('open');
}

function menuToggleClickHandler(): void {
  backdrop.style.display = 'block';
  sideDrawer.classList.add('open');
}

backdrop.addEventListener('click', backdropClickHandler);
menuToggle.addEventListener('click', menuToggleClickHandler);
