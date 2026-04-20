export class EventSystem {
  constructor() {
    this.listeners = {};
    this.state = {
      bass_hit: 0,
      lowmid_hit: 0,
      mid_hit: 0,
      vocal_hit: 0,
      high_hit: 0,
      energy: 0,
      rms: 0,
      centroid: 0,
      pulse: 0,
      shimmer: 0,
      sweep: 0,
      distortion: 0,
      fringe: 0,
      globalSpeed: 1,
      bands: {
        bass: 0,
        lowmid: 0,
        mid: 0,
        highmid: 0,
        high: 0,
      },
    };
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;

    for (const cb of this.listeners[event]) {
      cb(data);
    }
  }

  update(dt) {
    this.state.bass_hit = Math.max(0, this.state.bass_hit - dt * 4.0);
    this.state.lowmid_hit = Math.max(0, this.state.lowmid_hit - dt * 4.5);
    this.state.mid_hit = Math.max(0, this.state.mid_hit - dt * 5.0);
    this.state.vocal_hit = Math.max(0, this.state.vocal_hit - dt * 6.0);
    this.state.high_hit = Math.max(0, this.state.high_hit - dt * 8.0);

    this.state.pulse = Math.max(0, this.state.pulse - dt * 1.8);
    this.state.shimmer = Math.max(0, this.state.shimmer - dt * 2.5);
    this.state.sweep = Math.max(0, this.state.sweep - dt * 1.1);

    this.state.distortion *= Math.pow(0.5, dt * 9);
    if (this.state.distortion < 0.001) this.state.distortion = 0;

    this.state.fringe *= Math.pow(0.5, dt * 8);
    if (this.state.fringe < 0.001) this.state.fringe = 0;
  }
}

export const events = new EventSystem();
