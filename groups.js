// Master Map containing all 31 custom-defined Confusion Groups
const CONFUSION_GROUPS_MAP = {

    // --- High Difficulty Pools (Groups 1-31) ---

    "GROUP_RWB_MIXED_TRICOLOR": ["France", "Paraguay", "Luxembourg", "Netherlands", "Croatia"],

    "GROUP_PAN_ARAB_CHEVRON": ["Sudan", "Palestine", "Jordan", "Kuwait", "UAE"],

    "GROUP_STRIPES_CANTON": ["Liberia", "USA", "Malaysia"],

    "GROUP_PAN_AFRICAN_MIXED": ["Cameroon", "Senegal", "Guinea", "Mali", "Ghana"],

    "GROUP_R-Y-G_MIXED": ["Bolivia", "Ethiopia", "Guinea-Bissau", "Benin", "Congo", "Chad", "Romania"],

    "GROUP_BLK-R-Y_PALETTE": ["Germany", "Belgium", "Uganda", "Lithuania"],

    "GROUP_O-W-G_TRICOLOR": ["Côte d'Ivoire", "Ireland", "India", "Niger"],

    "GROUP_VERTICAL_HOIST_MIXED": ["Oman", "Belarus", "Madagascar", "Burkina Faso"],

    "GROUP_R-W_BI-COLOR": ["Singapore", "Indonesia", "Monaco", "Poland", "Malta"],

    "GROUP_PAN-SLAVIC_RWB": ["Russia", "Slovenia", "Slovakia", "Serbia"],

    "GROUP_COMPLEX_CENTRAL_EMBLEM": ["Andorra", "Bosnia and Herzegovina", "Barbados", "Moldova"],

    "GROUP_R-W_SIMPLE_EMBLEM": ["Austria", "Lebanon", "Canada", "Peru"],

    "GROUP_COMPLEX_STRIPES_TRIANGLE": ["Suriname", "South Sudan", "Kenya", "Malawi", "Libya", "Afghanistan"],

    "GROUP_COMPLEX_PAN_AFRICAN_GEOMETRY": ["Sao Tome and Principe", "Mozambique", "Comoros", "Central African Republic"],

    "GROUP_GREEN_CRESCENT_EMBLEM": ["Algeria", "Maldives", "Mauritania", "Pakistan", "Bangladesh"],

    "GROUP_B-W_EMBLEM_MIXED": ["San Marino", "Saint Lucia", "Guatemala", "Argentina", "Botswana"],

    "GROUP_B-W_STRIPES_EMBLEM": ["Israel", "Honduras", "Nicaragua", "El Salvador", "Estonia"],

    "GROUP_COMPLEX_MULTI_COLOR_EMBLEM": ["Lesotho", "Uzbekistan", "Djibouti", "Tanzania"],

    "GROUP_RWB_MULTI-STRIPE": ["Thailand", "North Korea", "Cuba", "Costa Rica"],

    "GROUP_RED_FIELD_EMBLEM": ["Montenegro", "Albania", "Morocco", "Vietnam", "China"],

    "GROUP_GREEN_FIELD_COMPLEX_EMBLEM": ["Zambia", "Turkmenistan", "Saudi Arabia", "Dominica"],

    "GROUP_RWB-ARAB_TRICOLOR": ["Iraq", "Syria", "Yemen", "Egypt"],

    "GROUP_GRAN_COLOMBIA": ["Venezuela", "Colombia", "Ecuador"],

    "GROUP_B-W_STRIPES_CROSS": ["Uruguay", "Greece", "Finland"],

    "GROUP_BLUE-YELLOW_MIXED": ["Rwanda", "Ukraine", "Sweden"],

    "GROUP_BLUE_ENSIGN": ["Fiji", "Tuvalu", "New Zealand", "Australia"],

    "GROUP_GEOMETRIC_OUTLIER": ["Nepal", "Panama", "Dominican Republic"],

    "GROUP_SUBTLE_GEOMETRY_FINAL": ["Qatar", "Bahrain", "Latvia", "Norway"],

    "GROUP_GWR_TRICOLOR_MIXED": ["Mexico", "Italy", "Nigeria", "Bulgaria"],

    "GROUP_CROSS_AND_EMBLEM": ["United Kingdom", "Iceland", "Cape Verde"],
    
    "GROUP_CROSS_EMBLEM_FINAL": ["Tunisia", "Turkey", "Georgia", "Denmark", "Switzerland"],


    // --- Fallback Pool (Group 32 - Mandatory Catch-All) ---

    // IMPORTANT: You MUST manually list every country from your database
    // that did NOT appear in any of the groups above. This ensures 100% coverage.
    "SOLO_FALLBACK_GROUP": [
        "Brazil", "Japan", "Vatican City", "Kiribati", "Tuvalu", "Tonga", "Samoa",
        // ... continue listing all remaining unassigned countries here
    ]
};
