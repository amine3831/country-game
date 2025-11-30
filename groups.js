// Master Map containing all custom-defined Confusion Groups with names matching your 195-country list.
const CONFUSION_GROUPS_MAP = {

    // --- High Difficulty Pools ---

    // Corrected: "Croatia" and "Paraguay" are included.
    "GROUP_RWB_MIXED_TRICOLOR": ["France", "Paraguay", "Luxembourg", "Netherlands", "Croatia", "Slovenia", "Slovakia", "Serbia"],

    // Corrected: Standardized names like "United Arab Emirates" and included "State of Palestine".
    "GROUP_PAN_ARAB_CHEVRON": ["Sudan", "State of Palestine", "Jordan", "Kuwait", "United Arab Emirates", "Yemen"], 

    // Corrected: Used "Liberia" and "United States".
    "GROUP_STRIPES_CANTON": ["Liberia", "United States", "Malaysia"],

    // Corrected: Included available Pan-African countries.
    "GROUP_PAN_AFRICAN_MIXED": ["Cameroon", "Senegal", "Guinea", "Mali", "Ghana", "Mozambique", "Zimbabwe"],

    // Corrected: Standardized names. "Congo (Brazzaville)" and "Benin" are included.
    "GROUP_R-Y-G_MIXED": ["Bolivia", "Ethiopia", "Guinea-Bissau", "Benin", "Congo (Brazzaville)", "Chad", "Romania", "Bulgaria"],

    // Corrected: Standardized names.
    "GROUP_BLK-R-Y_PALETTE": ["Germany", "Belgium", "Uganda", "Lithuania"],

    // Corrected: Used "Côte d'Ivoire" and "Niger".
    "GROUP_O-W-G_TRICOLOR": ["Côte d'Ivoire", "Ireland", "India", "Niger"],

    // Corrected: Standardized names.
    "GROUP_VERTICAL_HOIST_MIXED": ["Oman", "Belarus", "Madagascar", "Burkina Faso", "Peru"],

    // Corrected: "Monaco" and "Malta" are included.
    "GROUP_R-W_BI-COLOR": ["Singapore", "Indonesia", "Monaco", "Poland", "Malta"],

    // Corrected: Standardized names.
    "GROUP_PAN-SLAVIC_RWB": ["Russia", "Slovenia", "Slovakia", "Serbia", "Croatia", "Czechia"],

    // Corrected: Used "Bosnia and Herzegovina".
    "GROUP_COMPLEX_CENTRAL_EMBLEM": ["Andorra", "Bosnia and Herzegovina", "Barbados", "Moldova"],

    // Corrected: Standardized names.
    "GROUP_R-W_SIMPLE_EMBLEM": ["Austria", "Lebanon", "Canada", "Peru"],

    // Corrected: Used "South Sudan".
    "GROUP_COMPLEX_STRIPES_TRIANGLE": ["Suriname", "South Sudan", "Kenya", "Malawi", "Libya", "Afghanistan"],

    // Corrected: Used "Central African Republic" and "Sao Tome and Principe".
    "GROUP_COMPLEX_PAN_AFRICAN_GEOMETRY": ["Sao Tome and Principe", "Mozambique", "Comoros", "Central African Republic"],

    // Corrected: Standardized names.
    "GROUP_GREEN_CRESCENT_EMBLEM": ["Algeria", "Maldives", "Mauritania", "Pakistan", "Bangladesh"],

    // Corrected: Standardized names.
    "GROUP_B-W_EMBLEM_MIXED": ["San Marino", "Saint Lucia", "Guatemala", "Argentina", "Botswana", "Uruguay"],

    // Corrected: Standardized names.
    "GROUP_B-W_STRIPES_EMBLEM": ["Israel", "Honduras", "Nicaragua", "El Salvador", "Estonia"],

    // Corrected: Used "South Korea".
    "GROUP_COMPLEX_MULTI_COLOR_EMBLEM": ["Lesotho", "Uzbekistan", "Djibouti", "Tanzania", "South Korea"],

    // Corrected: Standardized names.
    "GROUP_RWB_MULTI-STRIPE": ["Thailand", "North Korea", "Cuba", "Costa Rica", "United States"],

    // Corrected: Standardized names.
    "GROUP_RED_FIELD_EMBLEM": ["Montenegro", "Albania", "Morocco", "Vietnam", "China"],

    // Corrected: Standardized names.
    "GROUP_GREEN_FIELD_COMPLEX_EMBLEM": ["Zambia", "Turkmenistan", "Saudi Arabia", "Dominica"],

    // Corrected: Standardized names.
    "GROUP_RWB-ARAB_TRICOLOR": ["Iraq", "Syria", "Yemen", "Egypt"],

    // Corrected: Standardized names.
    "GROUP_GRAN_COLOMBIA": ["Venezuela", "Colombia", "Ecuador"],

    // Corrected: Standardized names.
    "GROUP_B-W_STRIPES_CROSS": ["Uruguay", "Greece", "Finland"],

    // Corrected: Standardized names.
    "GROUP_BLUE-YELLOW_MIXED": ["Rwanda", "Ukraine", "Sweden"],

    // Corrected: Standardized names.
    "GROUP_BLUE_ENSIGN": ["Fiji", "Tuvalu", "New Zealand", "Australia", "United Kingdom"],

    // Corrected: Standardized names.
    "GROUP_GEOMETRIC_OUTLIER": ["Nepal", "Panama", "Dominican Republic"],

    // Corrected: Standardized names.
    "GROUP_SUBTLE_GEOMETRY_FINAL": ["Qatar", "Bahrain", "Latvia", "Norway"],

    // Corrected: Standardized names.
    "GROUP_GWR_TRICOLOR_MIXED": ["Mexico", "Italy", "Nigeria", "Bulgaria", "India"],

    // Corrected: Used "United Kingdom" and "Cabo Verde".
    "GROUP_CROSS_AND_EMBLEM": ["United Kingdom", "Iceland", "Cabo Verde", "Switzerland", "Denmark"],
    
    // Corrected: Used "Turkey" and "Denmark".
    "GROUP_CROSS_EMBLEM_FINAL": ["Tunisia", "Turkey", "Georgia", "Denmark", "Switzerland"],


    // --- Fallback Pool (Mandatory Catch-All) ---

    // Including all 195 country names as a safety measure for the selectUniqueRandom function.
    "SOLO_FALLBACK_GROUP": [
      "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", 
      "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", 
      "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", 
      "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Brazzaville)", "Congo (Kinshasa)", 
      "Costa Rica", "Côte d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic", 
      "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", 
      "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", 
      "Guinea-Bissau", "Guyana", "Haiti", "Holy See", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", 
      "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", 
      "North Korea", "South Korea", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", 
      "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", 
      "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", 
      "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", 
      "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", 
      "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", 
      "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", 
      "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "State of Palestine", "Sudan", "Suriname", "Sweden", "Switzerland", 
      "Syria", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", 
      "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", 
      "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
    ]
};

module.exports = CONFUSION_GROUPS_MAP;
