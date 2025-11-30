// --- MODULE IMPORTS ---
// Assume your Node.js environment uses 'require' to load local modules.
// 1. Load the Master Confusion Map (your new file)
const CONFUSION_GROUPS_MAP = require('./groups.js'); 

// 2. Load the main list of all countries/flags
// NOTE: Assuming flag_data.json is an array of country objects, and we extract a simple array of all names.
const FLAG_DATA_FULL = require('./flag_data.json');
const ALL_COUNTRIES_NAMES = FLAG_DATA_FULL.map(flag => flag.name); // Create simple array of all country names


// --- HELPER FUNCTIONS ---

/**
 * Helper: Picks a random unique item from an array without modification.
 * @param {Array} arr - The array to pick from.
 * @returns {any} A random element from the array.
 */
function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Helper: Randomly shuffles an array (Fisher-Yates algorithm).
 * @param {Array} arr - The array to shuffle.
 * @returns {Array} The shuffled array.
 */
function shuffleArray(arr) {
    const array = [...arr]; // Create a copy to avoid modifying original array
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Helper: Selects 'count' unique random items from an array, excluding items in the 'exclude' list.
 * @param {Array} sourceArr - Array to select from (the Distractor Pool).
 * @param {number} count - Number of items to select.
 * @param {Array} excludeArr - Items to exclude from the selection.
 * @returns {Array} Array of selected unique items.
 */
function selectUniqueRandom(sourceArr, count, excludeArr = []) {
    const selectionPool = sourceArr.filter(item => !excludeArr.includes(item));
    const selected = [];
    
    // Only proceed if there are items to select from
    if (selectionPool.length === 0) return selected;
    
    while (selected.length < count && selectionPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * selectionPool.length);
        const item = selectionPool.splice(randomIndex, 1)[0]; // Remove item to ensure uniqueness
        selected.push(item);
    }
    return selected;
}


// --- MAIN LOGIC FUNCTION ---

/**
 * Generates quiz options (4 total) based on the custom Confusion Groups Map.
 * @param {string} correctCountry - The name of the flag currently being displayed.
 * @returns {Array<string>} An array of four shuffled country names (options).
 */
function generateQuizOptions(correctCountry) {
    let distractors = [];
    let groupCountries = null;
    let groupKey = null;

    // 1. Find the Group for the correct country
    for (const key in CONFUSION_GROUPS_MAP) {
        if (CONFUSION_GROUPS_MAP[key].includes(correctCountry)) {
            groupCountries = CONFUSION_GROUPS_MAP[key];
            groupKey = key;
            break;
        }
    }

    // 2. Select Primary Distractors (The High Difficulty Check)
    if (groupCountries && groupKey !== 'SOLO_FALLBACK_GROUP') {
        // Find how many distractors we need to fill (3 total)
        const requiredDistractors = 3; 

        // Get members from the group, excluding the correct country
        const pool = groupCountries.filter(name => name !== correctCountry);

        // Select up to 3 similar flags from the pool
        const similarFlags = selectUniqueRandom(pool, requiredDistractors);
        distractors.push(...similarFlags);
        
        // If the group was small (e.g., only 3 members total), we only got 2 similar flags.
        // We will fill the rest with a truly random outlier in the next step.
    }

    // 3. Select the Random Outlier (Fills remaining slots if needed)
    
    // Calculate how many more options are needed to reach 3 total distractors
    const remainingSlots = 3 - distractors.length; 

    if (remainingSlots > 0) {
        // Collect all names already chosen (distractors + correct answer)
        const chosenNames = [correctCountry, ...distractors];

        // Select the remaining needed options from the entire country list
        const randomOutliers = selectUniqueRandom(ALL_COUNTRIES_NAMES, remainingSlots, chosenNames);
        distractors.push(...randomOutliers);
    }
    
    // 4. Assemble and Shuffle Final Options
    const finalOptions = [correctCountry, ...distractors];
    
    // NOTE: This array should always have 4 unique elements now.
    return shuffleArray(finalOptions);
}

// --- EXPORT THE FUNCTION (for use by your main server code) ---
module.exports = {
    generateQuizOptions
};

// --- EXAMPLE USAGE (For testing purposes in your server.js) ---
/*
const testFlag = 'Iraq';
const options = generateQuizOptions(testFlag);
console.log(`Correct Answer: ${testFlag}`);
console.log(`Quiz Options (Shuffled): ${options.join(', ')}`);
*/
