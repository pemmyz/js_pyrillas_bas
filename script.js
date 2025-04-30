// --- Initialization ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Define Colors ---
const BLACK = 'rgb(0, 0, 0)';
const WHITE = 'rgb(255, 255, 255)';
const BLUE = 'rgb(0, 0, 255)';
const RED = 'rgb(255, 0, 0)';
const GREY = 'rgb(128, 128, 128)';
const DARK_GREY = 'rgb(64, 64, 64)';
const CYAN = 'rgb(0, 255, 255)';
const YELLOW = 'rgb(255, 255, 0)';

// --- Define Constants ---
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1010;
const GRAVITY = 19.6 * 5; // Adjusted for web frame rates (trial and error)
const BULLET_SIZE = 10;
const DESTROYED_CIRCLE_SIZE = 60;
const TIME_SCALE = 0.05; // Might need adjustment or removal if using deltaTime fully
const ARROW_SPEED = 50;
const GORILLA_RADIUS = 20;

// Set canvas dimensions
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;

// --- Global Game State ---
let destroyedCircles = []; // List to track destroyed circles (explosions)
let keysPressed = {}; // Track currently pressed keys
let game; // Will hold the Game instance

// --- Helper Functions ---

function compute_circle_intersection_area(r1, r2, d) {
    if (d >= r1 + r2) {
        return 0;
    }
    if (d <= Math.abs(r2 - r1)) {
        return Math.PI * Math.min(r1, r2) ** 2;
    }
    const r1_sq = r1**2;
    const r2_sq = r2**2;
    // Check for invalid acos input due to floating point errors
    const acos_arg1 = (d**2 + r1_sq - r2_sq) / (2 * d * r1);
    const acos_arg2 = (d**2 + r2_sq - r1_sq) / (2 * d * r2);

    if (acos_arg1 > 1 || acos_arg1 < -1 || acos_arg2 > 1 || acos_arg2 < -1) {
         // This can happen if d is very close to r1+r2 or |r1-r2|
         // If d is almost r1+r2, area is almost 0
         if (Math.abs(d - (r1 + r2)) < 1e-6) return 0;
         // If d is almost |r1-r2|, area is almost pi * min(r1,r2)^2
         if (Math.abs(d - Math.abs(r1-r2)) < 1e-6) return Math.PI * Math.min(r1, r2)**2;
         // Fallback or error - returning 0 is safer than NaN
         console.warn("Invalid acos arguments in intersection:", acos_arg1, acos_arg2);
         return 0;
    }

    const part1 = r1_sq * Math.acos(acos_arg1);
    const part2 = r2_sq * Math.acos(acos_arg2);
    const part3 = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));

    if (isNaN(part1) || isNaN(part2) || isNaN(part3)) {
        console.error("NaN detected in intersection calculation", {r1, r2, d, part1, part2, part3});
        return 0; // Avoid NaN propagation
    }

    return part1 + part2 - part3;
}

function compute_explosion_damage(explosion_center, explosion_radius, player_center, player_radius = GORILLA_RADIUS) {
    const d = Math.hypot(explosion_center.x - player_center.x, explosion_center.y - player_center.y);
    const intersection_area = compute_circle_intersection_area(player_radius, explosion_radius, d);

    if (intersection_area < 1e-6) {
        // Check if edges are just touching or slightly overlapping due to float precision
        if (d < explosion_radius + player_radius + 1) { // Add small buffer
            return 20; // Minimum damage for a near miss/touch
        } else {
            return 0; // Clearly no overlap
        }
    }

    const player_area = Math.PI * player_radius**2;
    const fraction = intersection_area / player_area;
    let damage = 20 + fraction * 70; // Scale between 20 and 90
    damage = Math.max(20, Math.min(90, damage)); // Clamp damage
    return damage;
}


// --- Classes ---

class Sky {
    constructor() {
        this.sun_center = { x: SCREEN_WIDTH / 2, y: 100 };
        this.sun_radius = 40;
        this.ray_angle = 0;
    }

    draw(ctx) {
        // Background handled by CSS or main draw clear
        ctx.fillStyle = BLUE;
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        this.draw_sun(ctx);
        this.draw_sun_rays(ctx);
        this.draw_face(ctx);
    }

    draw_sun(ctx) {
        ctx.fillStyle = YELLOW;
        ctx.beginPath();
        ctx.arc(this.sun_center.x, this.sun_center.y, this.sun_radius, 0, Math.PI * 2);
        ctx.fill();
    }

    draw_sun_rays(ctx) {
        const num_rays = 12;
        const ray_length = 60;
        ctx.strokeStyle = YELLOW;
        ctx.lineWidth = 2;
        for (let i = 0; i < num_rays; i++) {
            const angle = (Math.PI * 2 / num_rays * i) + this.ray_angle; // Use radians
            const start_pos = {
                x: this.sun_center.x + this.sun_radius * Math.cos(angle),
                y: this.sun_center.y + this.sun_radius * Math.sin(angle),
            };
            const end_pos = {
                x: this.sun_center.x + (this.sun_radius + ray_length) * Math.cos(angle),
                y: this.sun_center.y + (this.sun_radius + ray_length) * Math.sin(angle),
            };
            ctx.beginPath();
            ctx.moveTo(start_pos.x, start_pos.y);
            ctx.lineTo(end_pos.x, end_pos.y);
            ctx.stroke();
        }
    }

    draw_face(ctx) {
        const eye_radius = 5;
        const left_eye_pos = {
            x: this.sun_center.x - this.sun_radius / 2,
            y: this.sun_center.y - this.sun_radius / 2
        };
        const right_eye_pos = {
            x: this.sun_center.x + this.sun_radius / 2,
            y: this.sun_center.y - this.sun_radius / 2
        };

        ctx.fillStyle = BLUE;
        ctx.beginPath();
        ctx.arc(left_eye_pos.x, left_eye_pos.y, eye_radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(right_eye_pos.x, right_eye_pos.y, eye_radius, 0, Math.PI * 2);
        ctx.fill();

        // Smile Arc
        ctx.strokeStyle = BLUE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Note: Canvas arc angles are different from Pygame's
        // Arc: center x, center y, radius, startAngle, endAngle, anticlockwise (false=default)
        ctx.arc(this.sun_center.x, this.sun_center.y, this.sun_radius * 0.6, 0, Math.PI);
        ctx.stroke();
    }

    update(deltaTime) {
        this.ray_angle += 1 * deltaTime * 60; // Adjust speed based on deltaTime
    }
}

class Building {
    constructor(x, width, height, color) {
        this.x = x;
        this.width = width;
        this.height = height;
        this.color = color;
        this.window_states = this.initialize_window_states();
    }

    initialize_window_states() {
        const num_windows_y = Math.floor((this.height - 10) / 20);
        const states = [];
        for (let r = 0; r < num_windows_y; r++) {
            const row = [];
             // Only 3 columns of windows as per original code
            for (let c = 0; c < 3; c++) {
                 row.push(Math.random() < 0.5); // True or False
            }
            states.push(row);
        }
        return states;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, SCREEN_HEIGHT - this.height, this.width, this.height);
        this.draw_windows(ctx);
    }

    draw_windows(ctx) {
        if (!this.window_states) return; // Safety check

        for (let row_idx = 0; row_idx < this.window_states.length; row_idx++) {
            const row = this.window_states[row_idx];
            for (let col_idx = 0; col_idx < row.length; col_idx++) {
                const window_on = row[col_idx];
                ctx.fillStyle = window_on ? YELLOW : DARK_GREY;
                const window_x = this.x + 5 + col_idx * 20;
                const window_y = SCREEN_HEIGHT - this.height + 10 + row_idx * 20;
                ctx.fillRect(window_x, window_y, 10, 10);
            }
        }
    }

    // Note: Destroy part is handled by adding to global `destroyedCircles`
    // Building itself doesn't track destruction, just its visual state

    is_point_destroyed(x, y) {
        for (const circle of destroyedCircles) {
            const dist_sq = (x - circle.x) ** 2 + (y - circle.y) ** 2;
            if (dist_sq <= circle.radius ** 2) {
                return true;
            }
        }
        return false;
    }

     get_rect() {
        return {
            x: this.x,
            y: SCREEN_HEIGHT - this.height,
            width: this.width,
            height: this.height
        };
    }
}

class Gorilla {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.health = 100;
        this.radius = GORILLA_RADIUS;
    }

    draw(ctx) {
        // Draw Gorilla Body
        ctx.fillStyle = RED; // Or another color like brown/black? Pygame used RED
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw Health Text
        ctx.fillStyle = WHITE;
        ctx.font = "24px sans-serif"; // Slightly smaller font?
        ctx.textAlign = "center";
        ctx.fillText(Math.round(this.health), this.x, this.y - this.radius - 5); // Position above gorilla
        ctx.textAlign = "left"; // Reset alignment
    }

     get_rect() {
         return {
            x: this.x - this.radius,
            y: this.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
         };
     }
}

class Bullet {
    constructor(x, y, angle, strength) {
        this.x = x;
        this.y = y;
        // Convert angle to radians for Math functions
        const radAngle = angle * Math.PI / 180;
        this.vx = strength * Math.cos(radAngle);
        this.vy = -strength * Math.sin(radAngle); // Negative because Y increases downwards
        // Removed time tracking as we use deltaTime directly
    }

    update(deltaTime) {
        // Simple Euler integration
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.vy += GRAVITY * deltaTime; // Gravity pulls down (increases vy)
    }

    draw(ctx) {
        ctx.fillStyle = YELLOW;
        ctx.fillRect(this.x - BULLET_SIZE / 2, this.y - BULLET_SIZE / 2, BULLET_SIZE, BULLET_SIZE);
    }

    check_collision(buildings, gorillas, turn) {
        // Check ground collision
        if (this.y + BULLET_SIZE / 2 > SCREEN_HEIGHT) {
            return { type: "ground", x: this.x, y: SCREEN_HEIGHT };
        }
        // Check wall collision
        if (this.x < 0 || this.x > SCREEN_WIDTH) {
            return { type: "wall", x: this.x, y: this.y };
        }

        const bulletRect = {
            x: this.x - BULLET_SIZE / 2,
            y: this.y - BULLET_SIZE / 2,
            width: BULLET_SIZE,
            height: BULLET_SIZE
        };

        // Check gorilla collision (only opponent)
        const opponentIndex = 1 - turn;
        const opponent = gorillas[opponentIndex];
        const gorillaRect = opponent.get_rect();
        if (rectOverlap(bulletRect, gorillaRect)) {
            // Direct hit damage is handled in handle_bullet_hit
             return { type: "direct", targetIndex: opponentIndex, x: this.x, y: this.y };
        }

        // Check building collision
        for (const building of buildings) {
            const buildingRect = building.get_rect();
            if (rectOverlap(bulletRect, buildingRect)) {
                 // Check if the collision point *within* the building is already destroyed
                 // Use bullet's center point for this check
                if (!building.is_point_destroyed(this.x, this.y)) {
                    // Add explosion circle centered on the bullet's impact point
                    destroyedCircles.push({ x: this.x, y: this.y, radius: DESTROYED_CIRCLE_SIZE });
                    return { type: "building", x: this.x, y: this.y };
                }
                // If hit point is already destroyed, the bullet might continue through
                // (This implementation stops it, matching Pygame behavior)
                 // If we wanted pass-through, we'd skip the return here
                 // For simplicity, let's keep it stopping on any hit
                 // but only causing damage/explosion if it hits non-destroyed part
                 return { type: "building_destroyed", x: this.x, y: this.y }; // Hit an already destroyed part
            }
        }

        return null; // No collision
    }
}

// Simple AABB collision check
function rectOverlap(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}


class Game {
    constructor() {
        this.buildings = this.create_buildings();
        this.gorillas = this.place_gorillas();
        this.sky = new Sky();
        this.bullet = null;
        this.turn = 0; // 0 for Player 1, 1 for Player 2
        this.angles = [45, 135]; // P1 aims right, P2 aims left initially
        this.strengths = [100, 100];
        this.scores = [0, 0];
        this.shots_fired = [0, 0];
        this.startTime = performance.now(); // Start time for the current round
        this.totalTimePaused = 0; // Time accumulated from previous rounds or pauses
        this.lastFrameTime = performance.now();
        this.message = "";
        this.keyPressDurations = { ArrowLeft: 0, ArrowRight: 0, ArrowUp: 0, ArrowDown: 0 };
        this.nextBlinkTime = performance.now() + (Math.random() * 0.5 + 0.25) * 1000;
        this.gameOver = false; // Flag to stop updates when resetting
    }

    create_buildings() {
        const buildings = [];
        const num_buildings = 30;
        const building_width = SCREEN_WIDTH / num_buildings;
        const building_colors = [RED, GREY, CYAN]; // Use defined color constants

        for (let i = 0; i < num_buildings; i++) {
            const height = Math.random() * 300 + 100; // 100 to 400 height
            const color = building_colors[Math.floor(Math.random() * building_colors.length)];
            buildings.push(new Building(i * building_width, building_width, height, color));
        }
        return buildings;
    }

     place_gorillas() {
         // Place gorillas roughly on buildings 5 and 24 (0-indexed)
         const buildingIndex1 = 5;
         const buildingIndex2 = 24;
         const building1 = this.buildings[buildingIndex1];
         const building2 = this.buildings[buildingIndex2];

         const gorilla1X = building1.x + building1.width / 2;
         const gorilla1Y = SCREEN_HEIGHT - building1.height - GORILLA_RADIUS;

         const gorilla2X = building2.x + building2.width / 2;
         const gorilla2Y = SCREEN_HEIGHT - building2.height - GORILLA_RADIUS;

         return [new Gorilla(gorilla1X, gorilla1Y), new Gorilla(gorilla2X, gorilla2Y)];
     }


    handle_input(deltaTime) {
         if (this.bullet || this.gameOver) return; // Don't handle angle/strength changes while bullet flying or resetting

         let angle_change = 0;
         let strength_change = 0;

         const accelFactorAngle = 1 + 3 * Math.max(this.keyPressDurations.ArrowLeft, this.keyPressDurations.ArrowRight);
         const accelFactorStrength = 1 + 2 * Math.max(this.keyPressDurations.ArrowUp, this.keyPressDurations.ArrowDown);

         if (keysPressed['ArrowLeft']) {
             this.keyPressDurations.ArrowLeft += deltaTime;
             angle_change += (ARROW_SPEED * 2) * accelFactorAngle * deltaTime; // Make angle change faster
         } else {
             this.keyPressDurations.ArrowLeft = 0;
         }
         if (keysPressed['ArrowRight']) {
             this.keyPressDurations.ArrowRight += deltaTime;
             angle_change -= (ARROW_SPEED * 2) * accelFactorAngle * deltaTime;
         } else {
             this.keyPressDurations.ArrowRight = 0;
         }
         if (keysPressed['ArrowUp']) {
             this.keyPressDurations.ArrowUp += deltaTime;
             strength_change += (ARROW_SPEED * 1) * accelFactorStrength * deltaTime; // Strength change slower
         } else {
             this.keyPressDurations.ArrowUp = 0;
         }
         if (keysPressed['ArrowDown']) {
             this.keyPressDurations.ArrowDown += deltaTime;
             strength_change -= (ARROW_SPEED * 1) * accelFactorStrength * deltaTime;
         } else {
             this.keyPressDurations.ArrowDown = 0;
         }

        this.angles[this.turn] = (this.angles[this.turn] + angle_change) % 360;
         if (this.angles[this.turn] < 0) this.angles[this.turn] += 360; // Keep angle positive

        this.strengths[this.turn] = Math.max(10, Math.min(300, this.strengths[this.turn] + strength_change)); // Clamp strength
    }

    shoot() {
        if (this.bullet || this.gameOver) return; // Don't shoot if bullet exists or game over

        const gorilla = this.gorillas[this.turn];
        const angle = this.angles[this.turn];
        const strength = this.strengths[this.turn]; // Use adjusted strength

        // Calculate starting position slightly offset from gorilla center along the angle
        const radAngle = angle * Math.PI / 180;
        const startOffsetX = (gorilla.radius + BULLET_SIZE) * Math.cos(radAngle);
        const startOffsetY = -(gorilla.radius + BULLET_SIZE) * Math.sin(radAngle); // Negative sin for Y-down coord

        const bulletX = gorilla.x + startOffsetX;
        const bulletY = gorilla.y + startOffsetY;

        this.bullet = new Bullet(bulletX, bulletY, angle, strength);
        this.shots_fired[this.turn]++;
        this.message = ""; // Clear previous message
    }


    update(deltaTime) {
        if (this.gameOver) return;

        this.sky.update(deltaTime);
        this.handle_input(deltaTime); // Handle angle/strength adjustments

        if (this.bullet) {
            this.bullet.update(deltaTime);
            const hit = this.bullet.check_collision(this.buildings, this.gorillas, this.turn);
            if (hit) {
                this.handle_bullet_hit(hit);
                this.bullet = null; // Remove bullet after hit
            }
        }

        // Update Blinking Windows
        const now = performance.now();
        if (now >= this.nextBlinkTime) {
            this.update_blinking(now);
        }
    }

    handle_bullet_hit(hit) {
        const explosion_center = { x: hit.x, y: hit.y };

        if (hit.type === "direct") {
            const targetIndex = hit.targetIndex;
            this.message = `Direct hit on Player ${targetIndex + 1}!`;
            this.gorillas[targetIndex].health -= 100; // Direct hit is fatal
        } else if (hit.type === "building") {
            this.message = "Hit a building! ";
            // Damage calculation for both gorillas from explosion
            for (let idx = 0; idx < this.gorillas.length; idx++) {
                const gorilla = this.gorillas[idx];
                const damage = compute_explosion_damage(
                    explosion_center,
                    DESTROYED_CIRCLE_SIZE,
                    { x: gorilla.x, y: gorilla.y },
                    gorilla.radius
                );
                if (damage > 0) {
                    this.message += ` P${idx+1} takes ${damage.toFixed(1)} damage. `;
                    gorilla.health -= damage;
                }
            }
        } else if (hit.type === "ground") {
            this.message = "Hit the ground!";
            // Optional: Add explosion effect on ground?
            destroyedCircles.push({ x: hit.x, y: SCREEN_HEIGHT, radius: DESTROYED_CIRCLE_SIZE / 2}); // Smaller crater
        } else if (hit.type === "wall") {
            this.message = "Hit the wall!";
        } else if (hit.type === "building_destroyed") {
             this.message = "Hit an already destroyed area.";
             // No new explosion or damage
        }


        // Check for game over after any hit that could cause damage
        let winner = -1;
        if (this.gorillas[0].health <= 0 && this.gorillas[1].health <= 0) {
            // Draw? Or whoever's turn it wasn't wins? Let's say opponent wins.
             winner = 1 - this.turn;
             this.message += ` Both players defeated! Player ${winner + 1} wins the round!`;
        } else if (this.gorillas[0].health <= 0) {
             winner = 1; // Player 2 wins
             this.message += ` Player 1 defeated! Player 2 wins the round!`;
        } else if (this.gorillas[1].health <= 0) {
             winner = 0; // Player 1 wins
             this.message += ` Player 2 defeated! Player 1 wins the round!`;
        }

        if (winner !== -1) {
            this.scores[winner]++;
            this.gameOver = true; // Pause updates
            // Add elapsed round time to total
            const roundEndTime = performance.now();
            this.totalTimePaused += (roundEndTime - this.startTime);
            // Show message and wait before reset
            setTimeout(() => this.reset_game(), 3000); // Reset after 3 seconds
        } else {
             // Switch turns only if game is not over
             this.turn = 1 - this.turn;
        }

        // Clamp health display minimum to 0
        this.gorillas.forEach(g => { if (g.health < 0) g.health = 0; });

    }

    draw(ctx) {
        // Clear canvas (or Sky draws background)
        // ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        this.sky.draw(ctx); // Sky draws its own background

        // Draw Buildings
        this.buildings.forEach(building => building.draw(ctx));

        // Draw Destroyed Circles (Explosions)
        this.draw_destroyed_circles(ctx);

        // Draw Bullet
        if (this.bullet) {
            this.bullet.draw(ctx);
        }

        // Draw Gorillas
        this.gorillas.forEach(gorilla => gorilla.draw(ctx));

        // Draw UI
        this.draw_ui(ctx);

        // Draw Aiming Arrow (only if no bullet flying and game not over)
        if (!this.bullet && !this.gameOver) {
            this.draw_arrow(ctx);
        }

        // Display Final Message if Game Over
         if (this.gameOver && this.message) {
             ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
             ctx.fillRect(SCREEN_WIDTH / 4, SCREEN_HEIGHT / 3, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 3);
             ctx.fillStyle = YELLOW;
             ctx.font = "40px sans-serif";
             ctx.textAlign = "center";
             ctx.fillText(this.message, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
             ctx.textAlign = "left"; // Reset
         }
    }

    draw_destroyed_circles(ctx) {
         // Draw filled explosion area (sky color)
        ctx.fillStyle = BLUE; // Match sky
        destroyedCircles.forEach(circle => {
            ctx.beginPath();
            ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw yellow cross marker on top
        ctx.strokeStyle = YELLOW;
        ctx.lineWidth = 2;
        destroyedCircles.forEach(circle => {
             // Draw only if center is roughly on screen (prevent drawing off-screen ground hits far away)
             if (circle.x > -circle.radius && circle.x < SCREEN_WIDTH + circle.radius &&
                 circle.y > -circle.radius && circle.y < SCREEN_HEIGHT + circle.radius)
             {
                ctx.beginPath();
                ctx.moveTo(circle.x - 10, circle.y);
                ctx.lineTo(circle.x + 10, circle.y);
                ctx.moveTo(circle.x, circle.y - 10);
                ctx.lineTo(circle.x, circle.y + 10);
                ctx.stroke();
             }
        });
    }


    draw_ui(ctx) {
        ctx.fillStyle = WHITE;
        ctx.font = "20px sans-serif";
        const lineHeight = 25;

        // Player 1 UI (Top Left)
        let yPos = 30;
        ctx.fillText(`P1 Angle: ${this.angles[0].toFixed(1)}`, 10, yPos);
        ctx.fillText(`P1 Strength: ${this.strengths[0].toFixed(1)}`, 10, yPos + lineHeight);
        ctx.fillText(`Health: ${Math.max(0, this.gorillas[0].health).toFixed(0)}`, 10, yPos + 2 * lineHeight);
        ctx.fillText(`Score: ${this.scores[0]}`, 10, yPos + 3 * lineHeight);
        ctx.fillText(`Shots: ${this.shots_fired[0]}`, 10, yPos + 4 * lineHeight);

        // Player 2 UI (Top Right)
        ctx.textAlign = "right";
        yPos = 30;
        ctx.fillText(`P2 Angle: ${this.angles[1].toFixed(1)}`, SCREEN_WIDTH - 10, yPos);
        ctx.fillText(`P2 Strength: ${this.strengths[1].toFixed(1)}`, SCREEN_WIDTH - 10, yPos + lineHeight);
        ctx.fillText(`Health: ${Math.max(0, this.gorillas[1].health).toFixed(0)}`, SCREEN_WIDTH - 10, yPos + 2 * lineHeight);
        ctx.fillText(`Score: ${this.scores[1]}`, SCREEN_WIDTH - 10, yPos + 3 * lineHeight);
        ctx.fillText(`Shots: ${this.shots_fired[1]}`, SCREEN_WIDTH - 10, yPos + 4 * lineHeight);
        ctx.textAlign = "left"; // Reset alignment

        // Total Time Played (Top Center)
         const currentTime = performance.now();
         // Calculate current time elapsed only if game is not paused for reset
         const timeElapsed = this.gameOver ? 0 : (currentTime - this.startTime);
         const totalTimePlayedSeconds = (this.totalTimePaused + timeElapsed) / 1000;

        ctx.textAlign = "center";
        ctx.fillText(`Time: ${totalTimePlayedSeconds.toFixed(1)}s`, SCREEN_WIDTH / 2, 30);
        ctx.textAlign = "left"; // Reset alignment

        // Display Message (Below UI)
        if (this.message && !this.gameOver) { // Don't show turn message if game over message is showing
            ctx.fillStyle = YELLOW;
            ctx.font = "24px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(this.message, SCREEN_WIDTH / 2, 100);
            ctx.textAlign = "left"; // Reset
        }

        // Indicate current turn
        ctx.fillStyle = this.turn === 0 ? CYAN : YELLOW;
        if (this.turn === 0) {
             ctx.fillRect(5, 5, 200, 5); // Line under P1 UI
        } else {
             ctx.fillRect(SCREEN_WIDTH - 205, 5, 200, 5); // Line under P2 UI
        }
    }

    draw_arrow(ctx) {
        const gorilla = this.gorillas[this.turn];
        const angle = this.angles[this.turn];
        const strength = this.strengths[this.turn];

        // Clamp strength for arrow length visualization if needed, but use real strength for physics
        const arrowLength = Math.min(strength, 150); // Max arrow length on screen

        const radAngle = angle * Math.PI / 180;
        const endX = gorilla.x + arrowLength * Math.cos(radAngle);
        const endY = gorilla.y - arrowLength * Math.sin(radAngle); // Negative sin for Y-down

        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gorilla.x, gorilla.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    update_blinking(currentTime) {
        const num_windows_to_toggle = Math.floor(Math.random() * 11) + 5; // 5 to 15
        for (let i = 0; i < num_windows_to_toggle; i++) {
            if (this.buildings.length === 0) continue;
            const building_index = Math.floor(Math.random() * this.buildings.length);
            const building = this.buildings[building_index];
            if (!building.window_states || building.window_states.length === 0 || building.window_states[0].length === 0) continue;

            const row_index = Math.floor(Math.random() * building.window_states.length);
            const col_index = Math.floor(Math.random() * building.window_states[0].length); // Assumes all rows same length

            building.window_states[row_index][col_index] = !building.window_states[row_index][col_index];
        }
        // Schedule next blink
        this.nextBlinkTime = currentTime + (Math.random() * 0.5 + 0.25) * 1000; // 0.25 to 0.75 seconds later
    }

    reset_game() {
        console.log("Resetting game...");
        destroyedCircles = []; // Clear explosion marks
        this.buildings = this.create_buildings();
        this.gorillas = this.place_gorillas(); // Places based on new buildings
        this.bullet = null;
        this.message = "New Round!";
        this.turn = Math.floor(Math.random() * 2); // Random starting player? Or alternate? Let's keep 0
        // Keep scores, shots_fired, totalTimePaused
        this.angles = [45, 135];
        this.strengths = [100, 100];
        this.startTime = performance.now(); // Reset round timer
        this.nextBlinkTime = performance.now() + (Math.random() * 0.5 + 0.25) * 1000;
        this.gameOver = false; // Allow updates again
        this.lastFrameTime = performance.now(); // Reset delta time calculation
        // Clear lingering key presses
        //keysPressed = {}; // Optionally clear keys, or let user keep holding
        this.keyPressDurations = { ArrowLeft: 0, ArrowRight: 0, ArrowUp: 0, ArrowDown: 0 };

        // Need to restart the game loop if it was fully stopped
        // But requestAnimationFrame usually keeps running unless explicitly cancelled
    }
}


// --- Event Listeners ---
window.addEventListener('keydown', (e) => {
    // Use e.key for modern browsers
    keysPressed[e.key] = true;

    // Handle Spacebar for shooting
    if (e.key === ' ' || e.key === 'Spacebar') { // Spacebar might have different keys depending on browser
        e.preventDefault(); // Prevent scrolling page down
        if (game) {
             game.shoot();
        }
    }
});

window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
    // Reset duration when key is released
     if (game && game.keyPressDurations.hasOwnProperty(e.key)) {
         game.keyPressDurations[e.key] = 0;
     }
});


// --- Game Loop ---
let lastTime = 0;

function gameLoop(timestamp) {
    // Calculate delta time in seconds
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Guard against huge deltaTime spikes (e.g., tab unfocus)
    const dt = Math.min(deltaTime, 0.1); // Max delta time step 100ms

    // Update game state
    game.update(dt);

    // Draw the game
    game.draw(ctx);

    // Request next frame
    requestAnimationFrame(gameLoop);
}

// --- Start Game ---
function startGame() {
    game = new Game();
    lastTime = performance.now(); // Initialize lastTime
    requestAnimationFrame(gameLoop);
}

startGame();
