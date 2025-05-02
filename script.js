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
const ARROW_SPEED = 50; // Base speed for angle/strength change
const GORILLA_RADIUS = 20;
const BULLET_SPEED_MULTIPLIER = 1.5; // Make bullets faster (1 = normal, >1 faster)
const MAX_SHOOT_STRENGTH = 350; // <<< UPDATED: Define max player input strength
const MIN_SHOOT_STRENGTH = 10; // Define min player input strength
const BULLET_IMMUNITY_DURATION = 0.05; // Seconds (50ms) of immunity after firing


// Set canvas dimensions
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;

// --- Global Game State ---
let destroyedCircles = []; // List to track destroyed circles (explosions)
let keysPressed = {}; // Track currently pressed keys
let game; // Will hold the Game instance

// --- Helper Functions ---

function compute_circle_intersection_area(r1, r2, d) {
    // Check for no intersection or one circle contained within the other
    if (d >= r1 + r2) {
        return 0; // No overlap
    }
    if (d <= Math.abs(r2 - r1)) {
        // Full containment, return area of smaller circle
        return Math.PI * Math.min(r1, r2) ** 2;
    }

    const r1_sq = r1*r1;
    const r2_sq = r2*r2;
    const d_sq = d*d;

    // Check for edge cases where arguments to acos might be slightly outside [-1, 1] due to floating point errors
    let angle1_arg = (d_sq + r1_sq - r2_sq) / (2 * d * r1);
    let angle2_arg = (d_sq + r2_sq - r1_sq) / (2 * d * r2);

    // Clamp arguments to the valid range [-1, 1]
    angle1_arg = Math.max(-1, Math.min(1, angle1_arg));
    angle2_arg = Math.max(-1, Math.min(1, angle2_arg));

    const acos1 = Math.acos(angle1_arg);
    const acos2 = Math.acos(angle2_arg);

    const term1 = r1_sq * acos1;
    const term2 = r2_sq * acos2;
    // Recalculate term3_sqrt_arg here for safety, maybe clamping caused issues before
    let term3_sqrt_arg_recalc = (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2);

    // If sqrt argument is negative due to float errors near boundaries, treat as zero overlap or full containment handled earlier
    if (term3_sqrt_arg_recalc < 0 && term3_sqrt_arg_recalc > -1e-9) { // Allow small negative tolerance
         term3_sqrt_arg_recalc = 0;
    } else if (term3_sqrt_arg_recalc < 0) {
        console.warn("Negative sqrt argument in intersection, likely float error near boundary:", term3_sqrt_arg_recalc);
         // Determine if it's closer to no overlap or full containment based on d vs r1+r2 and |r1-r2|
         if (Math.abs(d - (r1+r2)) < 1e-4) return 0;
         if (Math.abs(d - Math.abs(r1-r2)) < 1e-4) return Math.PI * Math.min(r1, r2)**2;
         return 0; // Fallback to zero area
    }

    const term3 = 0.5 * Math.sqrt(term3_sqrt_arg_recalc); // Use recalculated value
    const intersectionArea = term1 + term2 - term3;

    if (isNaN(intersectionArea) || intersectionArea < 0) {
        console.error("NaN or negative intersection area calculated", {r1, r2, d, acos1, acos2, term1, term2, term3, intersectionArea});
        // Attempt recovery based on distance
        if (d >= r1 + r2) return 0;
        if (d <= Math.abs(r2 - r1)) return Math.PI * Math.min(r1, r2) ** 2;
        return 0; // Fallback
    }

    return intersectionArea;
}


function compute_explosion_damage(explosion_center, explosion_radius, player_center, player_radius = GORILLA_RADIUS) {
    const d = Math.hypot(explosion_center.x - player_center.x, explosion_center.y - player_center.y);
    const intersection_area = compute_circle_intersection_area(player_radius, explosion_radius, d);

    if (intersection_area < 1e-6) {
        // Check if edges are just touching or slightly overlapping due to float precision
        if (d < explosion_radius + player_radius + 1) { // Add small buffer
            // Check if player is mostly outside the blast zone even if edges touch
            // If distance is very close to sum of radii, give minimum damage
             if (Math.abs(d - (explosion_radius + player_radius)) < 5) { // 5 pixel tolerance for near miss
                 return 20; // Minimum damage for a near miss/touch
             }
        }
        return 0; // Clearly no significant overlap
    }


    const player_area = Math.PI * player_radius**2;
    // Prevent division by zero if player_radius is 0
    if (player_area < 1e-6) return 90; // If player area is tiny, assume full damage on overlap

    // Calculate fraction, ensure it's not excessively high due to potential calculation errors
    const fraction = Math.max(0, Math.min(1, intersection_area / player_area)); // Clamp fraction between 0 and 1

    let damage = 20 + fraction * 70; // Scale between 20 and 90
    damage = Math.max(0, Math.min(90, damage)); // Clamp final damage between 0 and 90

    // Add extra check: if the distance is greater than radii sum but intersection was calculated > 0 (float issue), force 0 damage
    if (d > explosion_radius + player_radius + 1e-4) {
         console.warn("Correcting damage calculation: Intersection area found despite distance > radii sum.", {d, r1: player_radius, r2: explosion_radius, intersection_area});
         return 0;
    }


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
        // Background
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
            x: this.sun_center.x - this.sun_radius / 2.5, // Eyes slightly closer
            y: this.sun_center.y - this.sun_radius / 3   // Eyes slightly higher
        };
        const right_eye_pos = {
            x: this.sun_center.x + this.sun_radius / 2.5,
            y: this.sun_center.y - this.sun_radius / 3
        };

        ctx.fillStyle = BLUE; // Eyes same color as sky background
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
        // Adjust smile position and radius slightly
        ctx.arc(this.sun_center.x, this.sun_center.y + this.sun_radius * 0.1, this.sun_radius * 0.5, Math.PI * 0.2, Math.PI * 0.8); // Smaller arc, lower down
        ctx.stroke();
    }

    update(deltaTime) {
        // Ensure ray_angle doesn't grow indefinitely large
        const speed = 60; // degrees per second roughly
        this.ray_angle = (this.ray_angle + speed * deltaTime * Math.PI / 180) % (2 * Math.PI);
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
        // Ensure num_windows_y is not negative
        if (num_windows_y <= 0) return [];

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
        if (!this.window_states || this.window_states.length === 0) return; // Safety check

        for (let row_idx = 0; row_idx < this.window_states.length; row_idx++) {
            const row = this.window_states[row_idx];
            // Check if row exists and has columns
             if (!row || row.length === 0) continue;

            for (let col_idx = 0; col_idx < row.length; col_idx++) {
                const window_on = row[col_idx];
                ctx.fillStyle = window_on ? YELLOW : DARK_GREY;
                const window_x = this.x + 5 + col_idx * 20;
                const window_y = SCREEN_HEIGHT - this.height + 10 + row_idx * 20;
                ctx.fillRect(window_x, window_y, 10, 10);
            }
        }
    }

    // Checks if a specific point (x, y) falls within any explosion circle
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
        ctx.fillStyle = RED; // Pygame used RED
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw Health Text
        ctx.fillStyle = WHITE;
        ctx.font = "24px sans-serif";
        ctx.textAlign = "center";
        // Use Math.max to prevent showing negative health
        ctx.fillText(Math.max(0, Math.round(this.health)), this.x, this.y - this.radius - 5); // Position above gorilla
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
    constructor(x, y, angle, strength, firingGorillaIndex) { // Added firingGorillaIndex
        this.x = x;
        this.y = y;
        this.firingGorillaIndex = firingGorillaIndex; // Store who fired it
        this.timeAlive = 0; // Initialize time alive

        const radAngle = angle * Math.PI / 180;
        // Apply speed multiplier to initial velocity
        const initialSpeed = strength * BULLET_SPEED_MULTIPLIER; // Use multiplier
        this.vx = initialSpeed * Math.cos(radAngle);
        this.vy = -initialSpeed * Math.sin(radAngle); // Negative because Y increases downwards
    }

    update(deltaTime) {
        this.timeAlive += deltaTime; // Increment time alive
        // Simple Euler integration
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.vy += GRAVITY * deltaTime;
    }

    draw(ctx) {
        ctx.fillStyle = YELLOW;
        // Draw bullet centered
        ctx.fillRect(this.x - BULLET_SIZE / 2, this.y - BULLET_SIZE / 2, BULLET_SIZE, BULLET_SIZE);
    }

    check_collision(buildings, gorillas) { // Removed 'turn' - use firingGorillaIndex instead
        // Use bullet center for collision checks
        const checkX = this.x;
        const checkY = this.y;

        // --- Immunity Check ---
        const isImmune = this.timeAlive < BULLET_IMMUNITY_DURATION;

        // Define bullet rect for AABB checks
        const bulletRect = {
            x: this.x - BULLET_SIZE / 2,
            y: this.y - BULLET_SIZE / 2,
            width: BULLET_SIZE,
            height: BULLET_SIZE
        };

        // --- Ground and Wall Checks (Apply regardless of immunity) ---
        if (checkY > SCREEN_HEIGHT) {
            return { type: "ground", x: checkX, y: SCREEN_HEIGHT };
        }
        if (checkX < 0 || checkX > SCREEN_WIDTH) {
            return { type: "wall", x: checkX, y: checkY };
        }

        // --- Gorilla Checks ---
        for (let i = 0; i < gorillas.length; i++) {
            const gorilla = gorillas[i];
            const gorillaRect = gorilla.get_rect();

            if (rectOverlap(bulletRect, gorillaRect)) {
                if (i === this.firingGorillaIndex && isImmune) {
                    // Bullet is immune to the gorilla that fired it
                    // console.log("Immune collision with self"); // Debug
                    continue; // Skip this collision check
                } else if (i === this.firingGorillaIndex) {
                     // Hit self *after* immunity
                     console.log("Hit self!");
                     destroyedCircles.push({ x: checkX, y: checkY, radius: DESTROYED_CIRCLE_SIZE });
                     // Treat self-hit like a building hit for damage calculation
                     // Return structure needs to be consistent, pass targetIndex
                     return { type: "direct", targetIndex: i, x: checkX, y: checkY };
                } else {
                    // Direct hit on opponent
                    return { type: "direct", targetIndex: i, x: checkX, y: checkY };
                }
            }
        }


        // --- Building Checks ---
        // Find the building the firing gorilla is approximately on (for immunity)
        let firingBuilding = null;
        if (isImmune) { // Only need to find the building if immune period is active
             const ownGorilla = gorillas[this.firingGorillaIndex];
             for (const building of buildings) {
                 // Check if gorilla's center X is within building bounds and Y is close to the top
                 if (ownGorilla.x >= building.x && ownGorilla.x < building.x + building.width &&
                     Math.abs((SCREEN_HEIGHT - building.height) - ownGorilla.y) < GORILLA_RADIUS * 1.5) { // Check Y pos relative to building top (allow some tolerance)
                     firingBuilding = building;
                     break;
                 }
             }
             // Debug log if firing building not found when expected
             // if (!firingBuilding) console.log("Could not find firing building during immunity check");
        }


        for (const building of buildings) {
            const buildingRect = building.get_rect();

            if (rectOverlap(bulletRect, buildingRect)) {
                // Narrow phase: Check vertical position relative to building and screen
                if (checkY >= buildingRect.y && checkY <= SCREEN_HEIGHT) {
                    // Apply immunity if colliding with the firing gorilla's building
                    if (isImmune && building === firingBuilding) {
                        // console.log("Immune collision with firing building"); // Debug log
                        continue; // Skip collision check for this specific building during immunity
                    }

                    // If not immune or not the firing building, check if the point is destroyed
                    if (!building.is_point_destroyed(checkX, checkY)) {
                        // Hit a SOLID (non-destroyed) part.
                        destroyedCircles.push({ x: checkX, y: checkY, radius: DESTROYED_CIRCLE_SIZE });
                        return { type: "building", x: checkX, y: checkY };
                    }
                    // else: Hit a destroyed part, bullet continues.
                }
            }
        }

        return null; // No solid collision detected in this frame
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
        this.gorillas = this.place_gorillas(); // Ensure this is called after buildings are created
        this.sky = new Sky();
        this.bullet = null;
        this.turn = 0; // 0 for Player 1, 1 for Player 2
        this.angles = [45, 135]; // P1 aims right, P2 aims left initially
        this.strengths = [100, 100]; // Initial strength values
        this.scores = [0, 0];
        this.shots_fired = [0, 0];
        this.startTime = performance.now(); // Start time for the current round
        this.totalTimePaused = 0; // Time accumulated from previous rounds or pauses
        this.lastFrameTime = performance.now();
        this.message = "Player 1 Turn"; // Initial message
        this.messageTimeout = null; // Timer to clear hit messages
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
         const num_buildings = this.buildings.length;
         let buildingIndex1 = 5;
         let buildingIndex2 = 24;

         // Basic safety check for very few buildings
         if (num_buildings <= buildingIndex2) {
             console.warn(`Not enough buildings (${num_buildings}) for default placement. Adjusting.`);
             buildingIndex1 = Math.floor(num_buildings * 0.2);
             // Ensure index 2 is valid and different from index 1
             buildingIndex2 = Math.min(num_buildings - 1, Math.max(buildingIndex1 + 1, Math.floor(num_buildings * 0.8)));
             if (num_buildings <= 1) { // Edge case for 0 or 1 building
                buildingIndex1 = 0;
                buildingIndex2 = 0; // Gorillas will be on same building if only 1 exists
             }
         }

         const building1 = this.buildings[buildingIndex1];
         // Safety check if index 2 ended up same as 1 due to low num_buildings
         const building2 = (buildingIndex1 === buildingIndex2) ? building1 : this.buildings[buildingIndex2];

         // Check if buildings exist (safety)
         if (!building1 || !building2) {
             console.error("Failed to find buildings for gorilla placement! Using fallback positions.");
             // Place at fixed positions as a fallback
             return [new Gorilla(SCREEN_WIDTH * 0.2, SCREEN_HEIGHT - GORILLA_RADIUS - 50),
                     new Gorilla(SCREEN_WIDTH * 0.8, SCREEN_HEIGHT - GORILLA_RADIUS - 50)];
         }

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

         const baseAngleSpeed = ARROW_SPEED * 2; // degrees per second
         const baseStrengthSpeed = ARROW_SPEED * 1.5; // units per second (increased slightly)

         const maxAccelDuration = 1.0;
         const angleAccelMultiplier = 3;
         const strengthAccelMultiplier = 2.5; // Slightly increased accel

         const leftDuration = Math.min(this.keyPressDurations.ArrowLeft, maxAccelDuration);
         const rightDuration = Math.min(this.keyPressDurations.ArrowRight, maxAccelDuration);
         const upDuration = Math.min(this.keyPressDurations.ArrowUp, maxAccelDuration);
         const downDuration = Math.min(this.keyPressDurations.ArrowDown, maxAccelDuration);

         // Linear acceleration (simpler)
         const accelFactorAngle = 1 + angleAccelMultiplier * Math.max(leftDuration / maxAccelDuration, rightDuration / maxAccelDuration);
         const accelFactorStrength = 1 + strengthAccelMultiplier * Math.max(upDuration / maxAccelDuration, downDuration / maxAccelDuration);


         if (keysPressed['ArrowLeft']) {
             this.keyPressDurations.ArrowLeft += deltaTime;
             angle_change += baseAngleSpeed * accelFactorAngle * deltaTime;
         } else {
             this.keyPressDurations.ArrowLeft = 0;
         }
         if (keysPressed['ArrowRight']) {
             this.keyPressDurations.ArrowRight += deltaTime;
             angle_change -= baseAngleSpeed * accelFactorAngle * deltaTime;
         } else {
             this.keyPressDurations.ArrowRight = 0;
         }
         if (keysPressed['ArrowUp']) {
             this.keyPressDurations.ArrowUp += deltaTime;
             strength_change += baseStrengthSpeed * accelFactorStrength * deltaTime;
         } else {
             this.keyPressDurations.ArrowUp = 0;
         }
         if (keysPressed['ArrowDown']) {
             this.keyPressDurations.ArrowDown += deltaTime;
             strength_change -= baseStrengthSpeed * accelFactorStrength * deltaTime;
         } else {
             this.keyPressDurations.ArrowDown = 0;
         }

        this.angles[this.turn] = (this.angles[this.turn] + angle_change);
         // Keep angle between 0 and 180 for player 0 (right side)
         if (this.turn === 0) {
             this.angles[this.turn] = Math.max(0, Math.min(180, this.angles[this.turn]));
         }
         // Keep angle between 0 and 180 relative to the left (so 0 to 180 internally, but maps to 180-360 visually/physically if needed, though usually aiming left means angle < 180)
         // More simply: keep angle between 0 and 180 for player 1 (left side aiming)
         else { // turn === 1
            this.angles[this.turn] = Math.max(0, Math.min(180, this.angles[this.turn]));
         }

        // Clamp strength between MIN and MAX defined constants
        this.strengths[this.turn] = Math.max(MIN_SHOOT_STRENGTH, Math.min(MAX_SHOOT_STRENGTH, this.strengths[this.turn] + strength_change)); // Use MAX_SHOOT_STRENGTH
    }

    shoot() {
        if (this.bullet || this.gameOver) return;

        // Clear any previous message timeout
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
            this.messageTimeout = null;
        }

        const gorilla = this.gorillas[this.turn];
        const angle = this.angles[this.turn];
        const strength = this.strengths[this.turn];

        const radAngle = angle * Math.PI / 180;
        // Use a fixed offset slightly larger than gorilla radius + bullet radius
        const startOffset = GORILLA_RADIUS + BULLET_SIZE / 2 + 5; // Increased offset slightly
        const startOffsetX = startOffset * Math.cos(radAngle);
        // For Y, negative sin is up. Offset should be *away* from gorilla center.
        const startOffsetY = -startOffset * Math.sin(radAngle);


        const bulletX = gorilla.x + startOffsetX;
        const bulletY = gorilla.y + startOffsetY;

        // Pass 'this.turn' (the index of the firing gorilla) to the Bullet constructor
        this.bullet = new Bullet(bulletX, bulletY, angle, strength, this.turn); // Pass this.turn

        this.shots_fired[this.turn]++;
        this.message = ""; // Clear message, will be updated on hit or turn change
    }


    update(deltaTime) {
        if (this.gameOver) return;

        this.sky.update(deltaTime);
        this.handle_input(deltaTime); // Handle angle/strength adjustments

        if (this.bullet) {
            this.bullet.update(deltaTime);
            // Pass only necessary arguments to check_collision
            const hit = this.bullet.check_collision(this.buildings, this.gorillas);
            if (hit) {
                this.handle_bullet_hit(hit); // This might set gameOver = true
                this.bullet = null; // Remove bullet after hit processing
            }
        }

        // Update Blinking Windows (only if game not over)
        if (!this.gameOver) {
            const now = performance.now();
            if (now >= this.nextBlinkTime) {
                this.update_blinking(now);
            }
        }
    }

    // Sets a message and optionally clears it after a delay
    setMessage(newMessage, clearDelayMs = null) {
        this.message = newMessage;
        // Clear any existing timeout before setting a new one
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
            this.messageTimeout = null;
        }
        if (clearDelayMs !== null) {
            this.messageTimeout = setTimeout(() => {
                // Only clear if the message hasn't been overwritten by something else
                if (this.message === newMessage) {
                     // Restore the "Player X Turn" message instead of clearing
                     this.message = `Player ${this.turn + 1} Turn`;
                }
                this.messageTimeout = null;
            }, clearDelayMs);
        }
    }

    handle_bullet_hit(hit) {
        const explosion_center = { x: hit.x, y: hit.y };
        let roundOver = false; // Flag to check if the round ended this hit
        let hitMessage = ""; // Build the message for this hit

        if (hit.type === "direct") {
            const targetIndex = hit.targetIndex;
             if (targetIndex === this.turn) { // Hit self
                  hitMessage = "Hit self!";
                  this.gorillas[targetIndex].health -= 100; // Self-hit is also fatal
             } else { // Hit opponent
                  hitMessage = `Direct hit on Player ${targetIndex + 1}!`;
                  this.gorillas[targetIndex].health -= 100; // Direct hit is fatal
             }
        } else if (hit.type === "building") { // Includes self-hit case treated as building
            hitMessage = "Hit a building!";
            // Damage calculation for both gorillas from explosion
            for (let idx = 0; idx < this.gorillas.length; idx++) {
                const gorilla = this.gorillas[idx];
                if (gorilla.health <= 0) continue; // No damage if already dead

                const damage = compute_explosion_damage(
                    explosion_center,
                    DESTROYED_CIRCLE_SIZE,
                    { x: gorilla.x, y: gorilla.y },
                    gorilla.radius
                );
                if (damage > 0) {
                    // Round damage for display
                    const roundedDamage = Math.round(damage);
                    hitMessage += ` P${idx+1} takes ${roundedDamage} damage.`;
                    gorilla.health -= damage; // Apply actual damage
                }
            }
        } else if (hit.type === "ground") {
            hitMessage = "Hit the ground!";
            destroyedCircles.push({ x: hit.x, y: SCREEN_HEIGHT, radius: DESTROYED_CIRCLE_SIZE / 2}); // Smaller crater
        } else if (hit.type === "wall") {
            hitMessage = "Hit the wall!";
        }
        // No message change needed for hitting already destroyed parts

        // Clamp health display minimum to 0 after damage calculation
        this.gorillas.forEach(g => { if (g.health < 0) g.health = 0; });

        // --- Check for Game Over ---
        let winner = -1; // Initialize winner index
        const p1_dead = this.gorillas[0].health <= 0;
        const p2_dead = this.gorillas[1].health <= 0;
        roundOver = false; // Reset roundOver flag for this hit check

        if (p1_dead && p2_dead) {
             // If both die, the player *whose turn it was* loses (opponent wins)
             winner = 1 - this.turn;
             hitMessage += ` Both players defeated! Player ${winner + 1} wins the round!`;
             roundOver = true;
        } else if (p1_dead) {
             winner = 1; // Player 2 wins
             hitMessage += ` Player 1 defeated! Player 2 wins the round!`;
             roundOver = true;
        } else if (p2_dead) {
             winner = 0; // Player 1 wins
             hitMessage += ` Player 2 defeated! Player 1 wins the round!`;
             roundOver = true;
        }

        // Set the message, potentially with a delay to clear it if the round isn't over
        this.setMessage(hitMessage, roundOver ? null : 2500); // Show hit message for 2.5s if round continues

        if (roundOver) {
            // Ensure winner index is valid (0 or 1) before proceeding
            if (winner !== -1) {
                this.scores[winner]++;
                this.gameOver = true; // Pause updates
                const roundEndTime = performance.now();
                // Add the time elapsed in the final round before pausing
                this.totalTimePaused += (roundEndTime - this.startTime);
                this.startTime = roundEndTime; // Reset start time to prevent double counting on reset

                // Pass the winner index to reset_game via setTimeout
                setTimeout(() => this.reset_game(winner), 3000); // <<< Pass winner index
            } else {
                 console.error("Round over but winner index is invalid:", winner); // Should not happen if logic above is correct
                 // Handle potential error state, maybe just reset without changing turn?
                 setTimeout(() => this.reset_game(), 3000); // Fallback reset
            }
        } else {
             // Switch turns only if game is not over
             this.turn = 1 - this.turn;
             // Don't immediately overwrite the hit message. setMessage timeout will restore turn message.
        }
    }

    // Draws the central notification message (Turn info, hits)
    draw_notification_message(ctx) {
        let displayMessage = this.message;

        // Always show the current message unless the game is over (then show nothing here)
        if (this.gameOver) {
            displayMessage = "";
        }

        // If there's no specific hit message set, ensure it shows the correct turn
        if (!this.gameOver && (!this.message || this.message === "")) {
             displayMessage = `Player ${this.turn + 1} Turn`;
        }

        if (displayMessage) {
            ctx.fillStyle = YELLOW;
            ctx.font = "24px sans-serif";
            ctx.textAlign = "center";
            // <<< UPDATED Y-Coordinate: Draw below the sun (bottom edge approx Y=140)
            ctx.fillText(displayMessage, SCREEN_WIDTH / 2, 170);
            ctx.textAlign = "left"; // Reset
        }
    }


    draw(ctx) {
        // 1. Sky (Background and Sun)
        this.sky.draw(ctx);

        // 2. Notification Message (Below Sun, before other UI)
        this.draw_notification_message(ctx); // Call the dedicated function

        // 3. Buildings
        this.buildings.forEach(building => building.draw(ctx));

        // 4. Destroyed Circles (Explosions)
        this.draw_destroyed_circles(ctx);

        // 5. Bullet
        if (this.bullet) {
            this.bullet.draw(ctx);
        }

        // 6. Gorillas
        this.gorillas.forEach(gorilla => gorilla.draw(ctx));

        // 7. Main UI (Player stats, Time, Turn Indicator)
        this.draw_ui(ctx); // Draws everything EXCEPT the notification message now

        // 8. Aiming Arrow (only if no bullet flying and game not over)
        if (!this.bullet && !this.gameOver) {
            this.draw_arrow(ctx);
        }

        // 9. Display Final Game Over Message (draw over everything else)
         if (this.gameOver && this.message && !this.message.startsWith("Player")) { // Only show final win message, not lingering turn message
             ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
             ctx.fillRect(SCREEN_WIDTH / 4, SCREEN_HEIGHT / 3, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 3);
             ctx.fillStyle = YELLOW;
             ctx.font = "40px sans-serif";
             ctx.textAlign = "center";
             this.wrapText(ctx, this.message, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_WIDTH / 2 - 40, 45); // Centered Y
             ctx.textAlign = "left"; // Reset
         }
    }

    // Helper for basic text wrapping, centered vertically
    wrapText(context, text, x, y, maxWidth, lineHeight) {
        if (!text) return; // Safety check
        var words = text.split(' ');
        var line = '';
        var lines = []; // Store lines to calculate vertical centering later

        // First pass: break text into lines
        for(var n = 0; n < words.length; n++) {
          var testLine = line + words[n] + ' ';
          var metrics = context.measureText(testLine);
          var testWidth = metrics.width;
          if (testWidth > maxWidth && n > 0) {
            lines.push(line.trim());
            line = words[n] + ' ';
          }
          else {
            line = testLine;
          }
        }
        lines.push(line.trim()); // Add the last line

        // Calculate starting Y for vertical centering
        const totalTextHeight = lines.length * lineHeight;
        // Assuming y is the intended vertical center of the text block
        let currentY = y - totalTextHeight / 2 + lineHeight / 2;

        context.textBaseline = 'middle'; // Align text vertically better

        // Second pass: draw the lines centered horizontally
        for (let i = 0; i < lines.length; i++) {
            context.fillText(lines[i], x, currentY);
            currentY += lineHeight;
        }

        context.textBaseline = 'alphabetic'; // Reset baseline
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
             // Draw only if center is roughly on screen
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


    // Draws the top-left/right player info, time, and turn indicator
    draw_ui(ctx) {
        ctx.fillStyle = WHITE;
        ctx.font = "20px sans-serif";
        const lineHeight = 25;

        // Player 1 UI (Top Left)
        let yPos = 30;
        ctx.fillText(`P1 Angle: ${this.angles[0].toFixed(1)}°`, 10, yPos);
        ctx.fillText(`P1 Strength: ${this.strengths[0].toFixed(1)}`, 10, yPos + lineHeight);
        ctx.fillText(`Health: ${Math.max(0, Math.round(this.gorillas[0].health)).toFixed(0)}`, 10, yPos + 2 * lineHeight); // Round health for display
        ctx.fillText(`Score: ${this.scores[0]}`, 10, yPos + 3 * lineHeight);
        ctx.fillText(`Shots: ${this.shots_fired[0]}`, 10, yPos + 4 * lineHeight);

        // Player 2 UI (Top Right)
        ctx.textAlign = "right";
        yPos = 30;
        ctx.fillText(`P2 Angle: ${this.angles[1].toFixed(1)}°`, SCREEN_WIDTH - 10, yPos);
        ctx.fillText(`P2 Strength: ${this.strengths[1].toFixed(1)}`, SCREEN_WIDTH - 10, yPos + lineHeight);
        ctx.fillText(`Health: ${Math.max(0, Math.round(this.gorillas[1].health)).toFixed(0)}`, SCREEN_WIDTH - 10, yPos + 2 * lineHeight); // Round health for display
        ctx.fillText(`Score: ${this.scores[1]}`, SCREEN_WIDTH - 10, yPos + 3 * lineHeight);
        ctx.fillText(`Shots: ${this.shots_fired[1]}`, SCREEN_WIDTH - 10, yPos + 4 * lineHeight);
        ctx.textAlign = "left"; // Reset alignment

        // Total Time Played (Top Center)
         const currentTime = performance.now();
         // If game over, time doesn't advance further in this round. Show the total accumulated time.
         // If not game over, add the time elapsed since the round started.
         const timeElapsedThisRound = this.gameOver ? 0 : (currentTime - this.startTime);
         const totalTimePlayedSeconds = (this.totalTimePaused + timeElapsedThisRound) / 1000;

        ctx.textAlign = "center";
        ctx.fillText(`Time: ${totalTimePlayedSeconds.toFixed(1)}s`, SCREEN_WIDTH / 2, 30);
        ctx.textAlign = "left"; // Reset alignment

        // Indicate current turn with underline (draw regardless of message)
        ctx.fillStyle = this.turn === 0 ? CYAN : YELLOW;
        const underlineWidth = 200;
        const underlineY = 15; // Position above the main text
        if (!this.gameOver) { // Only show underline if game is active
            if (this.turn === 0) {
                 ctx.fillRect(5, underlineY, underlineWidth, 5); // Line under P1 UI area
            } else {
                 ctx.fillRect(SCREEN_WIDTH - underlineWidth - 5, underlineY, underlineWidth, 5); // Line under P2 UI area
            }
        }
    }

    draw_arrow(ctx) {
        const gorilla = this.gorillas[this.turn];
        const angle = this.angles[this.turn];
        const strength = this.strengths[this.turn];

        // Visually cap arrow length so it doesn't go crazy off screen at high strengths
        // Allow arrow to go slightly past max for visual feedback
        const visualStrength = Math.min(strength, MAX_SHOOT_STRENGTH * 1.1);
        // <<< UPDATED Cap: Increase the max length cap to better show higher strength
        const arrowLength = 20 + Math.min(visualStrength / 2.0, 220); // Adjusted scaling and increased capping for arrow length

        const radAngle = angle * Math.PI / 180;
        const endX = gorilla.x + arrowLength * Math.cos(radAngle);
        const endY = gorilla.y - arrowLength * Math.sin(radAngle); // Negative sin for Y-down

        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gorilla.x, gorilla.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Draw arrowhead
        const arrowAngle = Math.atan2(gorilla.y - endY, endX - gorilla.x); // Angle of the line itself
        const arrowSize = 10; // Slightly larger arrowhead
        ctx.fillStyle = WHITE; // Fill the arrowhead
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        // Calculate arrowhead points relative to endX, endY
        const point1X = endX - arrowSize * Math.cos(arrowAngle - Math.PI / 7); // Adjust angle for arrowhead shape
        const point1Y = endY + arrowSize * Math.sin(arrowAngle - Math.PI / 7);
        const point2X = endX - arrowSize * Math.cos(arrowAngle + Math.PI / 7);
        const point2Y = endY + arrowSize * Math.sin(arrowAngle + Math.PI / 7);

        ctx.lineTo(point1X, point1Y);
        ctx.lineTo(point2X, point2Y);
        ctx.closePath(); // Close the path to form a triangle
        ctx.fill(); // Fill the arrowhead
    }

    update_blinking(currentTime) {
        const num_windows_to_toggle = Math.floor(Math.random() * 11) + 5; // 5 to 15
        for (let i = 0; i < num_windows_to_toggle; i++) {
            if (this.buildings.length === 0) continue;
            const building_index = Math.floor(Math.random() * this.buildings.length);
            const building = this.buildings[building_index];
            // More robust checks for valid window states
            if (!building || !building.window_states || building.window_states.length === 0 || !building.window_states[0] || building.window_states[0].length === 0) continue;

            const num_rows = building.window_states.length;
            const num_cols = building.window_states[0].length;

            if (num_rows > 0 && num_cols > 0) {
                const row_index = Math.floor(Math.random() * num_rows);
                const col_index = Math.floor(Math.random() * num_cols);
                // Check if indices are valid before accessing
                if (building.window_states[row_index] !== undefined && building.window_states[row_index][col_index] !== undefined) {
                    building.window_states[row_index][col_index] = !building.window_states[row_index][col_index];
                }
            }
        }
        // Schedule next blink
        this.nextBlinkTime = currentTime + (Math.random() * 0.5 + 0.25) * 1000; // 0.25 to 0.75 seconds later
    }

    reset_game(winnerIndex) { // <<< Added winnerIndex parameter
        console.log(`Resetting game. Previous winner index: ${winnerIndex}`);
        // Clear any lingering message timeout from previous round
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
            this.messageTimeout = null;
        }
        destroyedCircles = []; // Clear explosion marks
        this.buildings = this.create_buildings();
        // Make sure gorillas are placed *after* new buildings exist
        this.gorillas = this.place_gorillas();
        this.bullet = null;

        // --- Set next turn based on loser ---
        if (winnerIndex !== undefined && winnerIndex !== -1 && winnerIndex >= 0 && winnerIndex <= 1) { // Check if a valid winner was passed
            const loserIndex = 1 - winnerIndex;
            this.turn = loserIndex; // <<< Loser starts next round
            console.log(`Loser (${loserIndex + 1}) starts next round.`);
        } else {
            // Fallback if no valid winner was passed (e.g., first game start)
             console.warn("Resetting game without a valid previous winner index. Defaulting turn to 0.");
             this.turn = 0; // Default to player 1 start
        }

        this.message = `Player ${this.turn + 1} Turn`; // Indicate whose turn starts

        // Keep scores, shots_fired
        // Reset health
        this.gorillas.forEach(g => g.health = 100);

        // Reset angles/strengths
        this.angles = [45, 135];
        this.strengths = [100, 100];

        // Reset round timer stuff - totalTimePaused is cumulative, startTime needs reset
        this.startTime = performance.now();

        this.nextBlinkTime = performance.now() + (Math.random() * 0.5 + 0.25) * 1000;
        this.gameOver = false; // Allow updates again
        this.lastFrameTime = performance.now(); // Reset delta time calculation
        // Clear lingering key presses
        this.keyPressDurations = { ArrowLeft: 0, ArrowRight: 0, ArrowUp: 0, ArrowDown: 0 };
        // keysPressed = {}; // Optionally clear global state too, but might interfere if keys held during reset
    }
}


// --- Event Listeners ---
window.addEventListener('keydown', (e) => {
    // Use e.key for modern browsers - ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Space
    keysPressed[e.key] = true;

    // Prevent default browser action for arrow keys and space (scrolling)
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
    }

    // Handle Spacebar for shooting
    if (e.key === ' ' || e.key === 'Spacebar') { // Check both possible values
        if (game && !game.gameOver && !game.bullet) { // Ensure game exists, not over, and no bullet flying
             game.shoot();
        }
    }
});

window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
    // Reset duration when key is released - ensure the key exists in durations object
     if (game && game.keyPressDurations && game.keyPressDurations.hasOwnProperty(e.key)) {
         game.keyPressDurations[e.key] = 0;
     }
});


// --- Game Loop ---
let lastTime = 0;

function gameLoop(timestamp) {
    // Calculate delta time in seconds
    if (lastTime === 0) { // Initialize lastTime on first frame
        lastTime = timestamp;
    }
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Guard against huge deltaTime spikes (e.g., tab unfocus) and zero/negative delta
    const dt = Math.max(0, Math.min(deltaTime, 0.1)); // Max delta time step 100ms, ensure non-negative

    // Update game state only if deltaTime is valid and game object exists
    if (dt > 0 && game) {
       // Only update if not game over (resetting)
       if (!game.gameOver) {
          game.update(dt);
       }
    }

    // Draw the game regardless of update pause (but check if game exists)
    if (game) {
       // Clear canvas before drawing
       ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
       game.draw(ctx);
    }

    // Request next frame
    requestAnimationFrame(gameLoop);
}

// --- Start Game ---
function startGame() {
    // Ensure canvas and context are valid
    if (!canvas || !ctx) {
        console.error("Canvas or context not found. Cannot start game.");
        return;
    }
    game = new Game();
    lastTime = 0; // Reset lastTime for the first frame calculation
    requestAnimationFrame(gameLoop);
}

// Wait for the DOM to be fully loaded before starting
document.addEventListener('DOMContentLoaded', startGame);
