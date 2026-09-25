/* ═══════════════════════════════════════════════════════
   OZKAFE — Official Anassa Menu Data
   Beside JW Marriott, EM Bypass, Kolkata · 100% Pure Veg
   Studied and matched directly from official Anassa Menu PDF
   ═══════════════════════════════════════════════════════ */

export const menuData = [

  /* ──────────────────────────────────────────
     1. HOT COFFEE
     Subheadings: BLACK COFFEES, WHITE COFFEES, MANUAL BREWING
  ────────────────────────────────────────── */
  {
    id: 'hot-coffee',
    title: 'Hot Coffee',
    emoji: '☕',
    heroLabel: 'IN-HOUSE ROASTED',
    image: '/images/coffee_latte_art_1781525927770.png',
    sizes: ['Regular'],
    items: [
      // BLACK COFFEES
      {
        id: 'hc-1',
        name: 'Single Espresso',
        subheading: 'BLACK COFFEES',
        desc: '',
        price: 89,
        img: '/images/single_espresso.png'
      },
      {
        id: 'hc-2',
        name: 'Double Espresso',
        subheading: 'BLACK COFFEES',
        desc: '',
        price: 99,
        img: '/images/double_espresso.png'
      },
      {
        id: 'hc-3',
        name: 'Americano',
        subheading: 'BLACK COFFEES',
        desc: '',
        price: 109,
        img: '/images/americano.png'
      },
      {
        id: 'hc-4',
        name: 'Espresso Macchiato',
        subheading: 'BLACK COFFEES',
        desc: '',
        price: 119,
        img: '/images/espresso_macchiato.png'
      },

      // WHITE COFFEES
      {
        id: 'hc-5',
        name: 'Cappuccino',
        subheading: 'WHITE COFFEES',
        desc: '',
        price: 129,
        img: '/images/cappuccino.png'
      },
      {
        id: 'hc-6',
        name: 'Latte',
        subheading: 'WHITE COFFEES',
        desc: '',
        price: 129,
        img: '/images/latte.png'
      },
      {
        id: 'hc-7',
        name: 'Flat White',
        subheading: 'WHITE COFFEES',
        desc: '',
        price: 139,
        img: '/images/flat_white.png'
      },
      {
        id: 'hc-8',
        name: 'Mocha',
        subheading: 'WHITE COFFEES',
        desc: '',
        price: 159,
        img: '/images/mocha_hc-8.png'
      },
      {
        id: 'hc-9',
        name: 'Cortado',
        subheading: 'WHITE COFFEES',
        desc: '',
        price: 119,
        img: '/images/cortado.png'
      },

      // MANUAL BREWING (Single Origin)
      {
        id: 'hc-10',
        name: 'Pour Over V60',
        subheading: 'MANUAL BREWING',
        desc: '',
        price: 139,
        img: '/images/pour_over_v60_hc-10.png'
      },
      {
        id: 'hc-11',
        name: 'Moka Pot',
        subheading: 'MANUAL BREWING',
        desc: '',
        price: 149,
        img: '/images/moka_pot_hc-11.png'
      },
      {
        id: 'hc-12',
        name: 'French Press',
        subheading: 'MANUAL BREWING',
        desc: '',
        price: 109,
        img: '/images/french_press_hc-12.png'
      },
      {
        id: 'hc-13',
        name: 'Chemex',
        subheading: 'MANUAL BREWING',
        desc: '',
        price: 139,
        img: '/images/chemex_hc-13.png'
      },
      {
        id: 'hc-14',
        name: 'South Indian Filter',
        subheading: 'MANUAL BREWING',
        desc: '',
        price: 99,
        img: '/images/south_indian_filter_hc-14.png'
      }
    ]
  },

  /* ──────────────────────────────────────────
     2. ICED CAFFEINE
     Subheadings: ICED COFFEES, ICE TEAS
  ────────────────────────────────────────── */
  {
    id: 'iced-caffeine',
    title: 'Iced Caffeine',
    emoji: '🧊',
    heroLabel: 'COLD & CRISP',
    image: '/images/coffee_iced_mocha_1781525938804.png',
    sizes: ['Regular'],
    items: [
      // ICED COFFEES
      {
        id: 'ic-1',
        name: 'Berrylicious Mocka Coffee',
        subheading: 'ICED COFFEES',
        desc: '',
        price: 189,
        img: '/images/berrylicious_mocka_coffee_highres.png'
      },
      {
        id: 'ic-2',
        name: 'Vietnamese / Cold Coffee',
        subheading: 'ICED COFFEES',
        desc: '',
        price: 169,
        img: '/images/vietnamese___cold_coffee_highres.png'
      },
      {
        id: 'ic-3',
        name: 'Coffee Fizzy',
        subheading: 'ICED COFFEES',
        desc: '',
        price: 159,
        img: '/images/coffee_fizzy_highres.png'
      },
      {
        id: 'ic-4',
        name: 'Mandarina',
        subheading: 'ICED COFFEES',
        desc: '',
        price: 169,
        img: '/images/mandarina_highres.png'
      },
      {
        id: 'ic-5',
        name: 'Affogato',
        subheading: 'ICED COFFEES',
        desc: '',
        price: 199,
        img: '/images/affogato_highres.png'
      },

      // ICE TEAS
      {
        id: 'ic-6',
        name: 'Lemon & Peach Ice Tea',
        subheading: 'ICE TEAS',
        desc: '',
        price: 159,
        img: '/images/lemon___peach_ice_tea_highres.png'
      },
      {
        id: 'ic-7',
        name: 'Hibiscus Ice Tea',
        subheading: 'ICE TEAS',
        desc: '',
        price: 139,
        img: '/images/hibiscus_ice_tea_highres.png'
      },
      {
        id: 'ic-8',
        name: 'Butterfly Ice Tea',
        subheading: 'ICE TEAS',
        desc: '',
        price: 139,
        img: '/images/butterfly_ice_tea_highres.png'
      }
    ]
  },

  /* ──────────────────────────────────────────
     3. COLD BREW
     Subheadings: SIGNATURE COLD BREWS
  ────────────────────────────────────────── */
  {
    id: 'cold-brew',
    title: 'Cold Brew',
    emoji: '⏳',
    heroLabel: '18-HOUR STEEP',
    image: '/images/coffee_iced_mocha_1781525938804.png',
    sizes: ['Regular'],
    items: [
      {
        id: 'cb-1',
        name: 'Classic Cold Brew',
        subheading: 'SIGNATURE COLD BREWS',
        desc: 'Bold, intense, less acidic plain coffee created by using 100% specialty-single origin beans from finest coffee estates.',
        price: 139,
        img: '/images/classic_cold_brew_cb-1.png'
      },
      {
        id: 'cb-2',
        name: 'Spiced Cold Brew',
        subheading: 'SIGNATURE COLD BREWS',
        desc: 'The cinnamon, nutmeg, and cloves make it a cozy, flavorful drink that\'s perfect for the aromatic & warm twist.',
        price: 149,
        img: '/images/spiced_cold_brew_cb-2.png'
      },
      {
        id: 'cb-3',
        name: 'Cold Brew Float',
        subheading: 'SIGNATURE COLD BREWS',
        desc: 'A delicious dessert-like drink combining bold coffee flavors with creamy vanilla ice cream.',
        price: 159,
        img: '/images/cold_brew_float_cb-3.png'
      },
      {
        id: 'cb-4',
        name: 'Cold Brew Concentrate Bottle',
        subheading: 'SIGNATURE COLD BREWS',
        desc: '180 ml concentrate bottle. Make naturally sweet, low-acidity smooth coffee at home.',
        price: 299,
        img: '/images/cold_brew_concentrate_bottle_cb-4.png'
      }
    ]
  },

  /* ──────────────────────────────────────────
     4. ARTISAN TEA
     Subheadings: TIMELESS, REJUVENATING, CAFFEINE-FREE
  ────────────────────────────────────────── */
  {
    id: 'premium-tea',
    title: 'Artisan Tea',
    emoji: '🫖',
    heroLabel: 'A CUP OF WELLBEING',
    image: '/images/hot_tea.jpg',
    sizes: ['Regular'],
    items: [
      // TIMELESS
      {
        id: 'tea-1',
        name: 'Darjeeling Tea',
        subheading: 'TIMELESS',
        desc: 'Known as the "Champagne of Teas" for its unique muscatel flavour and aroma.',
        price: 69,
        img: '/images/darjeeling_tea_tea-1.png'
      },
      {
        id: 'tea-2',
        name: 'Cutting Chai',
        subheading: 'TIMELESS',
        desc: 'A symphony of spices in every sip, bold, comforting & rejuvenating.',
        price: 49,
        img: '/images/cutting_chai_tea-2.png'
      },
      {
        id: 'tea-3',
        name: 'Assam CTC',
        subheading: 'TIMELESS',
        desc: 'Strong flavour, higher caffeine with distinct malty taste & delightfully robust tannic flavours.',
        price: 69,
        img: '/images/assam_ctc_tea-3.png'
      },

      // REJUVENATING
      {
        id: 'tea-4',
        name: 'Herbal Tea',
        subheading: 'REJUVENATING',
        desc: 'Strong and bold - pure refreshing bliss.',
        price: 119,
        img: '/images/herbal_tea_tea-4.png'
      },
      {
        id: 'tea-5',
        name: 'Chilli Tea',
        subheading: 'REJUVENATING',
        desc: 'Good for stomach & digestion.',
        price: 119,
        img: '/images/chilli_tea_tea-5.png'
      },
      {
        id: 'tea-6',
        name: 'Mango Tea',
        subheading: 'REJUVENATING',
        desc: 'Natural dried mango infused with tea.',
        price: 119,
        img: '/images/mango_tea_tea-6.png'
      },
      {
        id: 'tea-7',
        name: 'Ginger Tulshi Green Tea',
        subheading: 'REJUVENATING',
        desc: 'Natural dried ginger and tulshi infused with tea.',
        price: 119,
        img: '/images/ginger_tulshi_green_tea_tea-7.png'
      },
      {
        id: 'tea-8',
        name: 'Himalayan Green Tea',
        subheading: 'REJUVENATING',
        desc: 'The green, grassy taste along with the health benefits it brings, with the power of habit.',
        price: 79,
        img: '/images/himalayan_green_tea_tea-8.png'
      },

      // CAFFEINE-FREE
      {
        id: 'tea-9',
        name: 'Hibiscus Tea',
        subheading: 'CAFFEINE-FREE',
        desc: 'Robust & full-bodied red healthy tea with tannin aftertaste.',
        price: 119,
        img: '/images/hibiscus_tea_tea-9.png'
      },
      {
        id: 'tea-10',
        name: 'Blue Tea',
        subheading: 'CAFFEINE-FREE',
        desc: 'Rejuvenating the senses with Aparajita flowers.',
        price: 119,
        img: '/images/blue_tea_tea-10.png'
      },
      {
        id: 'tea-11',
        name: 'Cascara Tea',
        subheading: 'CAFFEINE-FREE',
        desc: 'The bold, strong dried coffee skin tea.',
        price: 119,
        img: '/images/cascara_tea_tea-11.png'
      },
      {
        id: 'tea-12',
        name: 'Mint Lemon Ginger',
        subheading: 'CAFFEINE-FREE',
        desc: 'Calming caffeine-free blends for relaxation.',
        price: 119,
        img: '/images/mint_lemon_ginger_tea-12.png'
      }
    ]
  },

  /* ──────────────────────────────────────────
     5. SHAKE & SPRITZER
     Subheadings: MOCKTAILS, SHAKES, REFRESHER
  ────────────────────────────────────────── */
  {
    id: 'shakes-spritzers',
    title: 'Shake & Spritzer',
    emoji: '🍹',
    heroLabel: 'COOL SIPS',
    image: '/images/mocktail_mojito_1781525990171.png',
    sizes: ['Regular'],
    items: [
      // MOCKTAILS
      {
        id: 'ss-1',
        name: 'Classic Mojito',
        subheading: 'MOCKTAILS',
        desc: 'Fresh mint, lime and a hint of sweetness. A classic, always refreshing.',
        price: 129,
        img: '/images/classic_mojito_ss-1.png'
      },
      {
        id: 'ss-2',
        name: 'Yuzu & Berries',
        subheading: 'MOCKTAILS',
        desc: 'A refreshing blend of yuzu, mixed berries and sparkling soda.',
        price: 149,
        img: '/images/yuzu___berries_ss-2.png'
      },
      {
        id: 'ss-3',
        name: 'Burnt Mango Chilli',
        subheading: 'MOCKTAILS',
        desc: 'Smoky mango, a touch of chilli, perfectly balanced.',
        price: 149,
        img: '/images/burnt_mango_chilli_ss-3.png'
      },

      // SHAKES
      {
        id: 'ss-4',
        name: 'Alphonso Milk Shake',
        subheading: 'SHAKES',
        desc: 'Made with real Alphonso mangoes.',
        price: 179,
        img: '/images/alphonso_milk_shake_ss-4.png'
      },
      {
        id: 'ss-5',
        name: 'Brownie Shake',
        subheading: 'SHAKES',
        desc: 'A decadent blend of chocolate and brownie bits.',
        price: 199,
        img: '/images/brownie_shake_ss-5.png'
      },
      {
        id: 'ss-6',
        name: 'Mixed Berry Shake',
        subheading: 'SHAKES',
        desc: 'Creamy delight with exotic berries.',
        price: 199,
        img: '/images/mixed_berry_shake_ss-6.png'
      },

      // REFRESHER
      {
        id: 'ss-7',
        name: 'Fresh Lime Soda (Sweet / Salty / Mix)',
        subheading: 'REFRESHER',
        desc: '',
        price: 59,
        img: '/images/fresh_lime_soda__sweet___salty___mix__ss-7.png'
      },
      {
        id: 'ss-8',
        name: 'Jeera / Pudina Lemon',
        subheading: 'REFRESHER',
        desc: 'A tangy, aromatic cooler.',
        price: 99,
        img: '/images/jeera___pudina_lemon_ss-8.png'
      },
      {
        id: 'ss-9',
        name: 'Bottled Water (500 ml)',
        subheading: 'REFRESHER',
        desc: 'Stay refreshed.',
        price: 10,
        img: '/images/bottled_water__500_ml__ss-9.png'
      }
    ]
  },

  /* ──────────────────────────────────────────
     6. FOOD & BITES
     Subheadings: SANDWICH & BURGER, PIZZA (7 INCH), PASTA, APPETIZERS
  ────────────────────────────────────────── */
  {
    id: 'sandwiches-appetizers',
    title: 'Food & Bites',
    emoji: '🥪',
    heroLabel: '100% PURE VEG',
    image: '/images/bites_garlic_bread_1781525761462.png',
    sizes: ['Regular'],
    items: [
      // SANDWICH & BURGER
      {
        id: 'fb-1',
        name: 'Corn & Cheese Sandwich',
        subheading: 'SANDWICH & BURGER',
        desc: 'Soft corn, cheese, minced veggies and herbs with white sauce.',
        price: 129,
        img: '/images/corn___cheese_sandwich_fb-1.png'
      },
      {
        id: 'fb-2',
        name: 'Paneer Tikka Sandwich',
        subheading: 'SANDWICH & BURGER',
        desc: 'Tandoori paneer, cheese with assorted veggies and herbs.',
        price: 139,
        img: '/images/paneer_tikka_sandwich_fb-2.png'
      },
      {
        id: 'fb-3',
        name: 'Pesto Mushroom Sandwich',
        subheading: 'SANDWICH & BURGER',
        desc: 'Mushroom, sweet onion, other assorted veggies & herbs with pesto sauce.',
        price: 149,
        img: '/images/pesto_mushroom_sandwich_fb-3.png'
      },
      {
        id: 'fb-4',
        name: 'Veg Burger',
        subheading: 'SANDWICH & BURGER',
        desc: 'Assorted veggies, cheese, assorted sauces.',
        price: 149,
        img: '/images/veg_burger_fb-4.png'
      },

      // PIZZA (7 INCH)
      {
        id: 'fb-5',
        name: 'Loaded Veggie Pizza (7")',
        subheading: 'PIZZA (7 INCH)',
        desc: 'Seasonal veggies, cheddar cheese, sweet onion & pepper.',
        price: 179,
        img: '/images/loaded_veggie_pizza__7___fb-5.png'
      },
      {
        id: 'fb-6',
        name: 'Paneer Tikka Pizza (7")',
        subheading: 'PIZZA (7 INCH)',
        desc: 'Paneer, mozzarella cheese, sweet pepper, onions on a white sauce base.',
        price: 189,
        img: '/images/paneer_tikka_pizza__7___fb-6.png'
      },

      // PASTA
      {
        id: 'fb-7',
        name: 'Veg Alfredo Pasta',
        subheading: 'PASTA',
        desc: 'Assorted veg, cheese, cream, sweet onion, white pasta sauce.',
        price: 169,
        img: '/images/veg_alfredo_pasta_fb-7.png'
      },
      {
        id: 'fb-8',
        name: 'Veg Arrabiata Pasta',
        subheading: 'PASTA',
        desc: 'Served with veggies and red pasta sauce with a kick to it!',
        price: 179,
        img: '/images/veg_arrabiata_pasta_fb-8.png'
      },

      // APPETIZERS
      {
        id: 'fb-9',
        name: 'Aachari Veg Wrap',
        subheading: 'APPETIZERS',
        desc: '',
        price: 169,
        img: '/images/aachari_veg_wrap_fb-9.png'
      },
      {
        id: 'fb-10',
        name: 'Open Toast',
        subheading: 'APPETIZERS',
        desc: '',
        price: 129,
        img: '/images/open_toast_fb-10.png'
      },
      {
        id: 'fb-11',
        name: 'Veg Puff',
        subheading: 'APPETIZERS',
        desc: '',
        price: 89,
        img: '/images/veg_puff_fb-11.png'
      },
      {
        id: 'fb-12',
        name: 'French Fries',
        subheading: 'APPETIZERS',
        desc: '',
        price: 109,
        img: '/images/french_fries_fb-12.png'
      },
      {
        id: 'fb-13',
        name: 'Loaded Fries',
        subheading: 'APPETIZERS',
        desc: '',
        price: 149,
        img: '/images/loaded_fries_fb-13.png'
      },
      {
        id: 'fb-14',
        name: 'Veg Momo',
        subheading: 'APPETIZERS',
        desc: '',
        price: 79,
        img: '/images/veg_momo_updated.png'
      },
      {
        id: 'fb-15',
        name: 'Samosa',
        subheading: 'APPETIZERS',
        desc: '',
        price: 30,
        img: '/images/samosa_fb-15.png'
      }
    ]
  },

  /* ──────────────────────────────────────────
     7. COMBOS (Happy Combos)
     Subheading: VALUE COMBOS
  ────────────────────────────────────────── */
  {
    id: 'combo-meals',
    title: 'Combos',
    emoji: '✨',
    heroLabel: 'HAPPY COMBOS',
    image: '/images/combo_flatwhite_garlic.jpg',
    sizes: ['Regular'],
    items: [
      {
        id: 'combo-1',
        name: 'Combo 1: Coffee + Pizza/Pasta',
        subheading: 'VALUE COMBOS',
        desc: 'Hot Coffee or Cold Coffee + Pizza or Pasta',
        price: 299,
        img: '/images/combo_1__coffee___pizza_pasta_combo-1.png'
      },
      {
        id: 'combo-2',
        name: 'Combo 2: Meal for Two',
        subheading: 'VALUE COMBOS',
        desc: 'Hot Coffee + Cold Coffee + French Fries + Burger + Pizza',
        price: 689,
        img: '/images/combo_2__meal_for_two_combo-2.png'
      },
      {
        id: 'combo-3',
        name: 'Combo 3: Feast for Four',
        subheading: 'VALUE COMBOS',
        desc: '2 Hot Coffee + 2 Cold Coffee + Sandwich + Burger + Pizza',
        price: 949,
        img: '/images/combo_3__feast_for_four_combo-3.png'
      }
    ]
  },

  /* ──────────────────────────────────────────
     8. BAKERY & DESSERTS
     Subheadings: MUFFIN, CAKES & SLICES, FRESH BREAD
  ────────────────────────────────────────── */
  {
    id: 'bakery-desserts',
    title: 'Bakery & Cakes',
    emoji: '🧁',
    heroLabel: 'FRESHLY BAKED',
    image: '/images/bites_garlic_bread_1781525761462.png',
    sizes: ['Regular'],
    items: [
      // MUFFIN
      {
        id: 'bk-1',
        name: 'Blueberry Muffin',
        subheading: 'MUFFIN',
        desc: 'Bursting with real blueberries',
        price: 99,
        img: '/images/blueberry_muffin_bk-1.png'
      },
      {
        id: 'bk-2',
        name: 'Chocolate Muffin',
        subheading: 'MUFFIN',
        desc: 'Rich and chocolaty',
        price: 99,
        img: '/images/chocolate_muffin_bk-2.png'
      },
      {
        id: 'bk-3',
        name: 'Almond Muffin',
        subheading: 'MUFFIN',
        desc: 'Loaded with roasted almonds',
        price: 99,
        img: '/images/almond_muffin_bk-3.png'
      },

      // CAKES & SLICES
      {
        id: 'bk-4',
        name: 'Red Velvet Slice',
        subheading: 'CAKES & SLICES',
        desc: 'Classic and velvety',
        price: 129,
        img: '/images/red_velvet_slice_bk-4.png'
      },
      {
        id: 'bk-5',
        name: 'Cheesecake',
        subheading: 'CAKES & SLICES',
        desc: 'Rich, creamy and indulgent',
        price: 139,
        img: '/images/cheesecake_bk-5.png'
      },
      {
        id: 'bk-6',
        name: 'Chocolate Fantasy Slice',
        subheading: 'CAKES & SLICES',
        desc: 'Decadent layers of chocolate',
        price: 149,
        img: '/images/chocolate_fantasy_slice_bk-6.png'
      },
      {
        id: 'bk-7',
        name: 'Walnut Brownie',
        subheading: 'CAKES & SLICES',
        desc: 'Fudgy, with crunchy walnuts',
        price: 109,
        img: '/images/walnut_brownie_bk-7.png'
      },

      // FRESH BREAD
      {
        id: 'bk-8',
        name: 'White Bread',
        subheading: 'FRESH BREAD',
        desc: 'Soft and classic',
        price: 50,
        img: '/images/fresh_bread.jpg'
      },
      {
        id: 'bk-9',
        name: 'Brown Bread',
        subheading: 'FRESH BREAD',
        desc: 'Wholesome and nutritious',
        price: 60,
        img: '/images/brown_bread_bk-9.png'
      },
      {
        id: 'bk-10',
        name: 'Multigrain Bread',
        subheading: 'FRESH BREAD',
        desc: 'A blend of grains and seeds',
        price: 80,
        img: '/images/multigrain_bread_bk-10.png'
      },
      {
        id: 'bk-11',
        name: 'Sourdough Loaf',
        subheading: 'FRESH BREAD',
        desc: 'Naturally fermented, full of flavor',
        price: 100,
        img: '/images/sourdough_loaf_bk-11.png'
      }
    ]
  }

];

/* ──────────────────────────────────────────
   EXTRA FLAVOURS & ADD-ONS (Available in Cart)
   Caramel, Hazelnut, Vanilla @ 19, Cold Brew Flavours +20, etc.
────────────────────────────────────────── */
export const menuAddons = [
  { id: 'addon-caramel', name: 'Caramel Flavour', price: 19, tag: 'Flavour', icon: '🍯' },
  { id: 'addon-hazelnut', name: 'Hazelnut Flavour', price: 19, tag: 'Flavour', icon: '🌰' },
  { id: 'addon-vanilla', name: 'Vanilla Flavour', price: 19, tag: 'Flavour', icon: '🍦' }
];
