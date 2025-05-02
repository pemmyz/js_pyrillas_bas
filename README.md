# js_pyrillas_bas

## Play it now: https://pemmyz.github.io/js_pyrillas_bas/


# 🦍 js_pyrillas_bas -  A 2-Player Artillery Game in javascript

A retro-style artillery game inspired by the classic "Gorillas" game, rebuilt using modern JavaScript and HTML5 Canvas. Two gorillas face off across a cityscape, throwing explosive projectiles at each other while accounting for gravity, angle, and power.

## 🚀 Features

- 🌆 Procedurally generated skyline with destructible buildings
- ☀️ Animated sun with eyes and a smile
- 🧍 Two-player local gameplay (turn-based)
- 💥 Explosion mechanics with area-based damage calculation
- 📊 UI showing angle, strength, health, score, and shots
- 🧠 Adaptive arrow controls with acceleration for precise aiming
- 🎆 Real-time damage modeling using overlapping circle intersection area
- 🏢 Blinking building windows for visual polish
- 🔄 Automatic round reset with score tracking

## 🎮 Controls

| Player        | Action         | Key              |
|---------------|----------------|------------------|
| Both Players  | Aim Left       | ← Arrow Key      |
| Both Players  | Aim Right      | → Arrow Key      |
| Both Players  | Increase Power | ↑ Arrow Key      |
| Both Players  | Decrease Power | ↓ Arrow Key      |
| Both Players  | Fire           | `Spacebar`       |

> Note: Controls apply to the current active player. The game is turn-based.

## 📷 Screenshots

![Gameplay Screenshot](screenshot.png) *(Replace with actual screenshot)*

## 🛠️ Tech Stack

- **Language:** JavaScript (ES6+)
- **Graphics:** HTML5 Canvas API
- **Rendering:** Procedural drawing using `CanvasRenderingContext2D`
- **Game Loop:** `requestAnimationFrame` based rendering and update cycle

## 📂 Project Structure

```text
index.html      # HTML container with canvas
main.js         # Game logic (contains all classes and rendering)
README.md       # Project documentation (this file)


## 🧠 Math Notes

**Explosion Damage** is based on the intersection area between two circles (blast radius and gorilla body), not just distance.

This provides a more realistic damage gradient (full damage at center, tapering off at edges).

Floating-point precision is handled with tolerance checks and clamping where necessary.

---

## ✅ To-Do / Ideas for Future

- 🧍‍♂️ AI-controlled gorilla (single-player mode)  
- 🌬️ Wind effects for projectiles  
- 🔊 Sound effects for hits and explosions  
- 📱 Mobile support with touch controls  
- 🏆 Match history or game stats  


## 🔧 Setup & Run

1. Clone or download this repository.
2. Open `index.html` in a web browser (no server required).
3. Start playing!


