'use strict';
/* Pitchford Fight — shared constants and the family roster. */
const T = 48, TAU = Math.PI * 2;
const BUFF_SPEED = 1.45, CARRY_SPEED = 0.93;
const SHOTK = ['pebble', 'zap', 'punch', 'pellet', 'petal', 'yarn', 'wave', 'book', 'blast', 'rover', 'bigpetal', 'fork'];

const ROSTER = {
  gary: {
    name: 'Gary', g: 'm', role: 'Pitchforker', hp: 4000, speed: 176, range: 8, reload: 1.5, supNeed: 3400, shotSp: 800,
    atk: 'Fork Toss', atkDesc: 'Hurls a pitchfork that goes straight through enemies.', sup: 'Fork Storm', supDesc: 'Sends pitchforks flying in every direction at once.',
    look: { skin: '#eab79a', hair: '#b9a98c', style: 'swept', beard: 'full', beardCol: '#c9c4ba', top: '#a9c4dc', pattern: 'jacket', inner: '#6f6d4c', bottom: '#2a2c38', shoes: '#3a3026', weapon: 'fork', bg: '#b8c7a6' },
  },
  soren: {
    name: 'Soren', g: 'm', role: 'Speedster', hp: 3000, speed: 205, range: 7.5, reload: 1.1, supNeed: 3000, shotSp: 820,
    atk: 'Slingshot', atkDesc: 'Snaps off two quick pebbles.', sup: 'Sugar Rush', supDesc: 'Zooms around and reloads super fast for a few seconds.',
    look: { h: .86, skin: '#e8b88c', hair: '#2b1d16', style: 'kid', top: '#f6f2e9', pattern: 'button', bottom: '#c8a46c', shoes: '#6b4a34', weapon: 'sling', bg: '#ffd166' },
  },
  tyler: {
    name: 'Tyler', g: 'm', role: 'Tank', hp: 6000, speed: 180, range: 2.6, reload: .8, supNeed: 3400, shotSp: 700,
    atk: 'Haymaker', atkDesc: 'A big short-range punch.', sup: 'Bull Rush', supDesc: 'Charges forward, smashing through walls and stunning anyone in the way.',
    look: { skin: '#eab892', hair: '#8a6a52', style: 'bald', beard: 'stubble', top: '#8796a3', pattern: 'button', bottom: '#30323d', shoes: '#2a2a33', weapon: 'fist', bg: '#9fb4c7' },
  },
  jason: {
    name: 'Jason', g: 'm', role: 'Engineer', hp: 3600, speed: 172, range: 8, reload: 1.3, supNeed: 3600, shotSp: 760,
    atk: 'Zap Blaster', atkDesc: 'Fires a three-round burst.', sup: 'Rover', supDesc: 'Deploys a little rover that shoots at nearby enemies.',
    look: { skin: '#f0c4a0', hair: '#2a1e1a', style: 'side', top: '#2f3f5f', pattern: 'jacket', inner: '#e4513a', bottom: '#2a2c38', shoes: '#22232b', weapon: 'blaster', bg: '#6c8cff' },
  },
  dylan: {
    name: 'Dylan', g: 'm', role: 'Scatter', hp: 3900, speed: 180, range: 6, reload: 1.5, supNeed: 3800, shotSp: 640,
    atk: 'Scatter Shot', atkDesc: 'Sprays a fan of five pellets.', sup: 'Big Blast', supDesc: 'A huge blast that breaks walls and shoves enemies back.',
    look: { skin: '#f0c6a4', hair: '#2a1f1c', style: 'curly', top: '#5d6c7e', pattern: 'chain', bottom: '#3a4660', shoes: '#f1f1f1', weapon: 'scatter', bg: '#ff9f43' },
  },
  scott: {
    name: 'Scott', g: 'm', role: 'Lobber', hp: 3300, speed: 172, range: 7.5, reload: 1.7, supNeed: 3400, shotSp: 9999, lob: true,
    atk: 'Balloon Toss', atkDesc: 'Lobs a water balloon over walls.', sup: 'Balloon Barrage', supDesc: 'Rains five balloons on the target area.',
    look: { skin: '#eec3a0', hair: '#3a2a22', style: 'short', beard: 'full', top: '#f4f4f1', pattern: 'button', bottom: '#33384a', shoes: '#4a3526', weapon: 'balloon', bg: '#48dbfb' },
  },
  bea: {
    name: 'Bea', g: 'f', role: 'Sharpshooter', hp: 2800, speed: 168, range: 10.5, reload: 1.9, supNeed: 3300, shotSp: 1150,
    atk: 'Petal Dart', atkDesc: 'One hard-hitting long-range shot.', sup: 'Full Bloom', supDesc: 'Three big petals that pierce through everyone.',
    look: { skin: '#e3ae84', hair: '#231815', style: 'long', top: '#26314f', pattern: 'floral', dress: true, bottom: '#26314f', shoes: '#d9b38c', weapon: 'flower', bg: '#ff8fab' },
  },
  harper: {
    name: 'Harper', g: 'f', role: 'Cat Wrangler', hp: 3100, speed: 190, range: 8.5, reload: 1.2, supNeed: 3200, shotSp: 700,
    atk: 'Yarn Ball', atkDesc: 'Bounces a ball of yarn off walls.', sup: 'Go Kitty!', supDesc: 'Sends the cat out to chase down enemies.',
    look: { h: .84, skin: '#e9b98f', hair: '#2a1c16', style: 'bob', top: '#f5f5f2', pattern: 'tee', bottom: '#7f9ccf', shoes: '#ff6b81', weapon: 'yarn', cat: true, bg: '#f8a5c2' },
  },
  sandy: {
    name: 'Sandy', g: 'f', role: 'Support', hp: 4200, speed: 176, range: 5.5, reload: 1.4, supNeed: 3300, shotSp: 560,
    atk: 'Splash Wave', atkDesc: 'A wide wave that passes through enemies.', sup: 'Sunny Spot', supDesc: 'Lays down a zone that heals you and your team.',
    look: { skin: '#dba27a', hair: '#30221c', style: 'pony', top: '#f4f2ee', pattern: 'stripes', bottom: '#3c5a8a', shoes: '#f1e3c8', weapon: 'hose', bg: '#7bed9f' },
  },
  terry: {
    name: 'Terry', g: 'f', role: 'Professor', hp: 3700, speed: 170, range: 7.5, reload: 1.5, supNeed: 3500, shotSp: 700,
    atk: 'Pop Quiz', atkDesc: 'Throws three books in a spread.', sup: 'Lecture', supDesc: 'A shockwave that stuns everyone nearby.',
    look: { skin: '#f0c3a2', hair: '#cdbb9d', style: 'shoulder', glasses: true, top: '#d7323d', pattern: 'band', bottom: '#3d4252', shoes: '#f1f1f1', weapon: 'book', bg: '#ff6b6b' },
  },
};
const ORDER = ['gary', 'soren', 'tyler', 'jason', 'dylan', 'scott', 'bea', 'harper', 'sandy', 'terry'];
const COMING_SOON = [];
const MODES = {
  showdown: { name: 'Solo Showdown', tag: 'Every Pitchford for themselves', desc: 'Up to 10 fighters. Smash gift boxes for power cupcakes, stay ahead of the storm, be the last one standing.' },
  ball: { name: 'Fight Ball', tag: '3 v 3', desc: 'Grab the ball, attack to kick or pass. First team to 2 goals wins.' },
};
if (typeof module !== 'undefined') module.exports = { T, TAU, ROSTER, ORDER, SHOTK, MODES };
