import { Game } from './core/Game';

window.addEventListener('error', (e) => {
  document.title = `ERR: ${e.message}`;
});
window.addEventListener('unhandledrejection', (e) => {
  document.title = `REJ: ${String(e.reason)}`;
});

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app container');

const game = new Game(app);
game.start();
