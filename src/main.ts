import { Game } from './core/Game';

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app container');

const game = new Game(app);
game.start();
