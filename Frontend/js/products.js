const products = [
    {
        "id": 88,
        "name": "Nike  air max 90 infrared gore-tex sneakers",
        "brand": "Nike",
        "category": "Men",
        "subcategory": "Footwear",
        "price": 175,
        "oldPrice": null,
        "image": "https://editorialist.com/thumbnail/600/2024/2/028/685/474/28685474~red_0.webp?width=600&quality=60",
        "hoverImage": "https://editorialist.com/thumbnails/600/2024/2/028/685/474/28685474~red_1.webp",
        "rating": 5,
        "discount": false,
        "description": "These low top sneakers feature a paneled design, signature Swoosh logo detail, round toe, front lace-up fastening, logo-embroidered tongue, branded heel counter and a rubber sole with Max Air cushioning. These styles are supplied by a premium sneaker marketplace. Stocking only the most sought-after footwear, they source and curate some of the most hard to find sneakers from around the world. The brand is Nike.",
        "sizes": ["38R", "40R", "42R", "44R", "46R"],
        "colors": ["Red", "yellow"],
        "inStock": true,
        "tags": []
    },
    {
        "id": 1,
        "name": "Prada Single-Breasted Wool & Silk Suit",
        "brand": "Prada",
        "category": "Men",
        "subcategory": "Suits",
        "price": 4200.00,
        "oldPrice": 4800.00,
        "image": "https://www.prada.com/content/dam/pradabkg_products/S/SGD/SGD190/199YF0005/SGD190_199Y_F0005_S_OOO_SLF.jpg",
        "hoverImage": "https://www.prada.com/content/dam/pradabkg_products/S/SGD/SGD190/199YF0005/SGD190_199Y_F0005_S_OOO_MDF.jpg",
        "rating": 4.9,
        "discount": true,
        "description": "Tailored in Italy from Super 150s virgin wool and silk blend. Classic single-breasted two-button blazer paired with flat-front trousers featuring an enamelled metal triangle logo.",
        "sizes": ["48R", "50R", "52R", "54R"],
        "colors": ["Navy Blue", "Black"],
        "inStock": true,
        "tags": ["prada", "suit", "wool", "silk", "men", "formal"]
    },
    {
        "id": 2,
        "name": "Prada Super 150s Wool Tuxedo Suit",
        "brand": "Prada",
        "category": "Men",
        "subcategory": "Suits",
        "price": 4900.00,
        "oldPrice": null,
        "image": "https://www.prada.com/content/dam/pradabkg_products/S/SGD/SGD190/199YF0008/SGD190_199Y_F0008_S_OOO_SLF.jpg",
        "hoverImage": "https://www.prada.com/content/dam/pradabkg_products/S/SGD/SGD190/199YF0008/SGD190_199Y_F0008_S_OOO_MDF.jpg",
        "rating": 5.0,
        "discount": false,
        "description": "Exquisite evening tuxedo with silk satin peak lapels and satin side stripe trousers. Designed for black-tie galas and formal events.",
        "sizes": ["48R", "50R", "52R", "54R"],
        "colors": ["Midnight Black"],
        "inStock": true,
        "tags": ["prada", "tuxedo", "suit", "black tie", "men"]
    },
    {
        "id": 3,
        "name": "Prada Fine Cashmere Crew-Neck Sweater",
        "brand": "Prada",
        "category": "Men",
        "subcategory": "Shirts",
        "price": 1950.00,
        "oldPrice": 2250.00,
        "image": "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF146/18DYF0040/UMF146_18DY_F0040_S_OOO_SLF.jpg",
        "hoverImage": "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF146/18DYF0040/UMF146_18DY_F0040_S_OOO_MDF.jpg",
        "rating": 4.8,
        "discount": true,
        "description": "Ultra-soft pure cashmere knit crew-neck sweater finished with ribbed hem and subtle triangle chest emblem.",
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Slate Blue", "Charcoal"],
        "inStock": true,
        "tags": ["prada", "cashmere", "sweater", "knitwear", "men"]
    },
    {
        "id": 4,
        "name": "Prada Wool & Silk V-Neck Sweater",
        "brand": "Prada",
        "category": "Men",
        "subcategory": "Shirts",
        "price": 1650.00,
        "oldPrice": null,
        "image": "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF148/18DYF0AN1/UMF148_18DY_F0AN1_S_OOO_SLF.jpg",
        "hoverImage": "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF148/18DYF0AN1/UMF148_18DY_F0AN1_S_OOO_MDF.jpg",
        "rating": 4.7,
        "discount": false,
        "description": "Lightweight gauge V-neck sweater knit from virgin wool and silk blend for refined layering.",
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Anthracite", "Black"],
        "inStock": true,
        "tags": ["prada", "sweater", "v-neck", "wool", "men"]
    },
    {
        "id": 5,
        "name": "Prada Re-Nylon Technical Bermuda Shorts",
        "brand": "Prada",
        "category": "Men",
        "subcategory": "Shorts",
        "price": 980.00,
        "oldPrice": 1150.00,
        "image": "https://www.prada.com/content/dam/pradabkg_products/S/SPH/SPH571/6403F0161/SPH571_6403_F0161_S_OOO_SLF.jpg",
        "hoverImage": "https://www.prada.com/content/dam/pradabkg_products/S/SPH/SPH571/6403F0161/SPH571_6403_F0161_S_OOO_MDF.jpg",
        "rating": 4.9,
        "discount": true,
        "description": "Tailored knee-length shorts in regenerated Re-Nylon fabric featuring side welt pockets and enamelled metal triangle badge.",
        "sizes": ["46", "48", "50", "52"],
        "colors": ["Military Green", "Black"],
        "inStock": true,
        "tags": ["prada", "shorts", "re-nylon", "bermuda", "men"]
    },
    {
        "id": 6,
        "name": "Prada Single-Breasted Tailored Flannel Blazer",
        "brand": "Prada",
        "category": "Men",
        "subcategory": "Suits",
        "price": 3400.00,
        "oldPrice": 3900.00,
        "image": "https://www.prada.com/content/dam/pradabkg_products/U/UGM/UGM542/6350F0R60/UGM542_6350_F0R60_S_OOO_SLF.jpg",
        "hoverImage": "https://www.prada.com/content/dam/pradabkg_products/U/UGM/UGM542/6350F0R60/UGM542_6350_F0R60_S_OOO_MDF.jpg",
        "rating": 4.8,
        "discount": true,
        description: "Soft wool flannel blazer featuring notch lapels, flap pockets, and double back vent.",
        sizes: ["48R", "50R", "52R", "54R"],
        colors: ["Melange Grey"],
        inStock: true,
        tags: ["prada", "blazer", "flannel", "wool", "men"]
    },

    {
        id: 7,
        name: "Prada Poplin Short-Sleeve Bowling Shirt",
        brand: "Prada",
        category: "Men",
        subcategory: "Shirts",
        price: 1100.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UCN/UCN719/19S1F0009/UCN719_19S1_F0009_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UCN/UCN719/19S1F0009/UCN719_19S1_F0009_S_OOO_MDF.jpg",
        rating: 4.7,
        discount: false,
        description: "Boxy short-sleeve shirt crafted from crisp cotton poplin with revere collar and chest patch pocket.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["White", "Black"],
        inStock: true,
        tags: ["prada", "shirt", "bowling", "poplin", "men"]
    },

    {
        id: 8,
        name: "Prada Tailored Wool Flannel Shirt",
        brand: "Prada",
        category: "Men",
        subcategory: "Shirts",
        price: 1450.00,
        oldPrice: 1650.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/S/SC8/SC865/6350F0R60/SC865_6350_F0R60_S_AAO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/S/SC8/SC865/6350F0R60/SC865_6350_F0R60_S_AAO_MDF.jpg",
        rating: 4.8,
        discount: true,
        description: "Button-down shirt in brushed fine wool flannel with classic collar and cuff detailing.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Grey Flannel"],
        inStock: true,
        tags: ["prada", "shirt", "flannel", "wool", "men"]
    },

    {
        id: 9,
        name: "Prada Straight-Leg Flannel Trousers",
        brand: "Prada",
        category: "Men",
        subcategory: "Trousers",
        price: 1250.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UP0/UP0447/6350F0R60/UP0447_6350_F0R60_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UP0/UP0447/6350F0R60/UP0447_6350_F0R60_S_OOO_MDF.jpg",
        rating: 4.7,
        discount: false,
        description: "Flat-front wool flannel trousers styled with pressed creases and angled front pockets.",
        sizes: ["46", "48", "50", "52"],
        colors: ["Grey"],
        inStock: true,
        tags: ["prada", "trousers", "flannel", "men"]
    },

    {
        id: 10,
        name: "Prada Nappa Leather Biker Jacket",
        brand: "Prada",
        category: "Men",
        subcategory: "Outerwear",
        price: 5800.00,
        oldPrice: 6400.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UPW/UPW643/6559F0008/UPW643_6559_F0008_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UPW/UPW643/6559F0008/UPW643_6559_F0008_S_OOO_MDF.jpg",
        rating: 5.0,
        discount: true,
        description: "Supple Nappa leather biker jacket featuring padded shoulders, silver zips, and enamelled triangle logo.",
        sizes: ["48", "50", "52"],
        colors: ["Black"],
        inStock: true,
        tags: ["prada", "leather", "biker", "jacket", "men"]
    },

    {
        id: 11,
        name: "Prada Brushed Cashmere Crewneck Sweater",
        brand: "Prada",
        category: "Men",
        subcategory: "Shirts",
        price: 2100.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF146/18DYF0154/UMF146_18DY_F0154_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF146/18DYF0154/UMF146_18DY_F0154_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: false,
        description: "Brushed pure cashmere knit sweater offering cocooning warmth and velvety tactile texture.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Terracotta", "Camel"],
        inStock: true,
        tags: ["prada", "cashmere", "sweater", "men"]
    },

    {
        id: 12,
        name: "Prada Bleached Organic Denim Jacket",
        brand: "Prada",
        category: "Men",
        subcategory: "Outerwear",
        price: 2400.00,
        oldPrice: 2700.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/G/GEP/GEP272/6287F0ADE/GEP272_6287_F0ADE_S_182_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/G/GEP/GEP272/6287F0ADE/GEP272_6287_F0ADE_S_182_MDF.jpg",
        rating: 4.8,
        discount: true,
        description: "Boxy organic denim jacket with sun-bleached treatment and enamelled triangle back patch.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Bleached Blue"],
        inStock: true,
        tags: ["prada", "denim", "jacket", "men"]
    },

    {
        id: 13,
        name: "Prada Re-Nylon Hooded Puffer Coat",
        brand: "Prada",
        category: "Men",
        subcategory: "Outerwear",
        price: 3600.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UPS/UPS719/1967F077U/UPS719_1967_F077U_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UPS/UPS719/1967F077U/UPS719_1967_F077U_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: false,
        description: "Goose-down padded puffer coat crafted from eco-friendly Re-Nylon with detachable hood.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Navy Blue", "Black"],
        inStock: true,
        tags: ["prada", "re-nylon", "puffer", "coat", "men"]
    },

    {
        id: 14,
        name: "Prada Hawaiian Print Silk Shirt",
        brand: "Prada",
        category: "Men",
        subcategory: "Shirts",
        price: 1850.00,
        oldPrice: 2100.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UCS/UCS562/18NNF0009/UCS562_18NN_F0009_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UCS/UCS562/18NNF0009/UCS562_18NN_F0009_S_OOO_MDF.jpg",
        rating: 4.7,
        discount: true,
        description: "Lustrous pure silk short-sleeve shirt decorated with vibrant vintage archival floral print.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["White / Floral"],
        inStock: true,
        tags: ["prada", "silk", "shirt", "hawaiian", "men"]
    },

    {
        id: 15,
        name: "Prada Double Cashmere Dinner Suit",
        brand: "Prada",
        category: "Men",
        subcategory: "Suits",
        price: 5400.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/S/SGD/SGD237/199YF0002/SGD237_199Y_F0002_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/S/SGD/SGD237/199YF0002/SGD237_199Y_F0002_S_OOO_MDF.jpg",
        rating: 5.0,
        discount: false,
        description: "Pure cashmere two-piece dinner suit featuring hand-stitched lapels and horn buttons.",
        sizes: ["48R", "50R", "52R"],
        colors: ["Jet Black"],
        inStock: true,
        tags: ["prada", "cashmere", "suit", "formal", "men"]
    },

    {
        id: 16,
        name: "Prada Fine Stretch Oxford Shirt",
        brand: "Prada",
        category: "Men",
        subcategory: "Shirts",
        price: 890.00,
        oldPrice: 1050.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UC5/UC587I/6114F0002/UC587I_6114_F0002_S_LMO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UC5/UC587I/6114F0002/UC587I_6114_F0002_S_LMO_MDF.jpg",
        rating: 4.8,
        discount: true,
        description: "Slim-fit stretch cotton Oxford dress shirt featuring mother-of-pearl buttons.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["White", "Light Blue"],
        inStock: true,
        tags: ["prada", "oxford", "shirt", "men"]
    },

    {
        id: 17,
        name: "Prada Lightweight Re-Nylon Vest",
        brand: "Prada",
        category: "Men",
        subcategory: "Outerwear",
        price: 1650.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UPS/UPS720/1968F0324/UPS720_1968_F0324_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UPS/UPS720/1968F0324/UPS720_1968_F0324_S_OOO_MDF.jpg",
        rating: 4.8,
        discount: false,
        description: "Padded Re-Nylon gilet vest featuring zipper closure and triangle metal chest badge.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Grey", "Black"],
        inStock: true,
        tags: ["prada", "re-nylon", "vest", "gilet", "men"]
    },

    {
        id: 18,
        name: "Prada Vintage Check Short-Sleeve Shirt",
        brand: "Prada",
        category: "Men",
        subcategory: "Shirts",
        price: 1200.00,
        oldPrice: 1400.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UCN/UCN696/6274F05NR/UCN696_6274_F05NR_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UCN/UCN696/6274F05NR/UCN696_6274_F05NR_S_OOO_MDF.jpg",
        rating: 4.7,
        discount: true,
        description: "Cotton check print bowling shirt with camp collar and enamelled chest patch.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Check / Navy"],
        inStock: true,
        tags: ["prada", "shirt", "check", "men"]
    },

    {
        id: 19,
        name: "Prada Bowling Short Sleeve Silk Shirt",
        brand: "Prada",
        category: "Men",
        subcategory: "Shirts",
        price: 1750.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UCN/UCN697/18NNF0014/UCN697_18NN_F0014_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UCN/UCN697/18NNF0014/UCN697_18NN_F0014_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: false,
        description: "Relaxed silk twill shirt with printed retro motif and chest patch pocket.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Print / Multi"],
        inStock: true,
        tags: ["prada", "silk", "shirt", "men"]
    },

    {
        id: 20,
        name: "Prada Slim Fit Cotton Trousers",
        brand: "Prada",
        category: "Men",
        subcategory: "Trousers",
        price: 980.00,
        oldPrice: 1150.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UP0/UP0453/6114F0008/UP0453_6114_F0008_S_CMO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UP0/UP0453/6114F0008/UP0453_6114_F0008_S_CMO_MDF.jpg",
        rating: 4.8,
        discount: true,
        description: "Tailored stretch cotton chinos with slim fit silhouette and back welt pockets.",
        sizes: ["46", "48", "50", "52"],
        colors: ["Navy", "Beige"],
        inStock: true,
        tags: ["prada", "trousers", "chinos", "men"]
    },

    {
        id: 21,
        name: "Prada Technical Re-Nylon Anorak",
        brand: "Prada",
        category: "Men",
        subcategory: "Outerwear",
        price: 2400.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UPS/UPS715/6559F0201/UPS715_6559_F0201_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UPS/UPS715/6559F0201/UPS715_6559_F0201_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: false,
        description: "Hooded half-zip anorak jacket in waterproof Re-Nylon fabric.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Brown", "Black"],
        inStock: true,
        tags: ["prada", "anorak", "re-nylon", "jacket", "men"]
    },

    {
        id: 22,
        name: "Prada Heavy Wool Knit Turtleneck",
        brand: "Prada",
        category: "Men",
        subcategory: "Shirts",
        price: 1850.00,
        oldPrice: 2100.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF147/18DYF0003/UMF147_18DY_F0003_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF147/18DYF0003/UMF147_18DY_F0003_S_OOO_MDF.jpg",
        rating: 4.8,
        discount: true,
        description: "Chunky rib-knit virgin wool turtleneck sweater with ribbed cuffs.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["White", "Charcoal"],
        inStock: true,
        tags: ["prada", "turtleneck", "wool", "sweater", "men"]
    },

    {
        id: 23,
        name: "Prada Distressed Leather Car Coat",
        brand: "Prada",
        category: "Men",
        subcategory: "Outerwear",
        price: 6800.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UPW/UPW280/038F0003/UPW280_038_F0003_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UPW/UPW280/038F0003/UPW280_038_F0003_S_OOO_MDF.jpg",
        rating: 5.0,
        discount: false,
        description: "Hand-finished vintage distressed leather car coat with point collar and horn buttons.",
        sizes: ["48", "50", "52"],
        colors: ["Brown"],
        inStock: true,
        tags: ["prada", "leather", "coat", "car coat", "men"]
    },

    {
        id: 24,
        name: "Prada Ribbed Wool Zip-Up Sweater",
        brand: "Prada",
        category: "Men",
        subcategory: "Shirts",
        price: 1950.00,
        oldPrice: 2250.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF417/6252F0033/UMF417_6252_F0033_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/U/UMF/UMF417/6252F0033/UMF417_6252_F0033_S_OOO_MDF.jpg",
        rating: 4.8,
        discount: true,
        description: "Heavy rib cardigan sweater featuring full-zip front and high collar.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Navy Blue"],
        inStock: true,
        tags: ["prada", "wool", "cardigan", "zip-up", "men"]
    },

    {
        id: 25,
        name: "Gibson London Navy Texture Tailored Suit",
        brand: "Gibson London",
        category: "Men",
        subcategory: "Suits",
        price: 249.00,
        oldPrice: 310.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar26103mj_021_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar26103mj_021_b.jpg",
        rating: 4.9,
        discount: true,
        description: "Tailored navy textured suit jacket and trouser set by Gibson London. Features notch lapels, peak pockets, and signature printed buggy lining.",
        sizes: ["38R", "40R", "42R", "44R", "46R"],
        colors: ["Navy Blue"],
        inStock: true,
        tags: ["suit", "gibson london", "suit direct", "tailored", "navy", "men"]
    },

    {
        id: 26,
        name: "Marc Darcy Charcoal Windowpane Check Suit",
        brand: "Marc Darcy",
        category: "Men",
        subcategory: "Suits",
        price: 289.00,
        oldPrice: 345.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar26132jd_021_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar26132jd_021_b.jpg",
        rating: 4.8,
        discount: true,
        description: "Dapper charcoal windowpane check 3-piece suit set from Marc Darcy. Double button jacket with plush suede trim detailing.",
        sizes: ["38R", "40R", "42R", "44R"],
        colors: ["Charcoal Check"],
        inStock: true,
        tags: ["suit", "marc darcy", "suit direct", "check", "charcoal", "men"]
    },

    {
        id: 27,
        name: "Racing Green Light Blue Linen Blend Suit",
        brand: "Racing Green",
        category: "Men",
        subcategory: "Suits",
        price: 199.00,
        oldPrice: 249.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/as23102mj_170_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/as23102mj_170_b.jpg",
        rating: 4.7,
        discount: true,
        description: "Summer light blue linen-blend tailored suit by Racing Green. Lightweight and breathable for summer weddings and garden celebrations.",
        sizes: ["38R", "40R", "42R", "44R", "46R"],
        colors: ["Light Blue"],
        inStock: true,
        tags: ["suit", "racing green", "suit direct", "linen", "blue", "men"]
    },

    {
        id: 28,
        name: "Limehaus Slim Fit Olive Green Suit",
        brand: "Limehaus",
        category: "Men",
        subcategory: "Suits",
        price: 179.00,
        oldPrice: 220.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar26105mj_310_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar26105mj_310_b.jpg",
        rating: 4.9,
        discount: true,
        description: "Modern slim-fit olive green tailored suit jacket and trousers set by Limehaus. Sharp narrow lapels and contemporary silhouette.",
        sizes: ["36R", "38R", "40R", "42R", "44R"],
        colors: ["Olive Green"],
        inStock: true,
        tags: ["suit", "limehaus", "suit direct", "olive", "slim fit", "men"]
    },

    {
        id: 29,
        name: "Gibson London Navy Textured Suit Trousers",
        brand: "Gibson London",
        category: "Men",
        subcategory: "Trousers",
        price: 79.00,
        oldPrice: 95.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/0079668_290_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/0079668_290_b.jpg",
        rating: 4.8,
        discount: true,
        description: "Tailored flat-front navy textured suit trousers by Gibson London. Made with slant side pockets and button-through rear welt pockets.",
        sizes: ["30R", "32R", "34R", "36R", "38R"],
        colors: ["Navy Blue"],
        inStock: true,
        tags: ["trousers", "gibson london", "suit direct", "suit trousers", "navy", "men"]
    },

    {
        id: 30,
        name: "Prada Embroidered Poplin Midi Shirt Dress",
        brand: "Prada",
        category: "Women",
        subcategory: "Dresses",
        price: 3200.00,
        oldPrice: 3600.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P24/P24E3P/6348F0Y20/P24E3P_6348_F0Y20_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P24/P24E3P/6348F0Y20/P24E3P_6348_F0Y20_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: true,
        description: "Crafted from fine cotton poplin, this Prada midi dress features delicate eyelet embroidery, a tailored shirt collar, and the iconic enamel triangle logo.",
        sizes: ["36", "38", "40", "42"],
        colors: ["White", "Black"],
        inStock: true,
        tags: ["prada", "dress", "poplin", "luxury", "women"]
    },

    {
        id: 31,
        name: "Prada Re-Nylon & Silk Satin Evening Gown",
        brand: "Prada",
        category: "Women",
        subcategory: "Dresses",
        price: 4500.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P10/P10A9/1PSWF0005/P10A9_1PSW_F0005_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P10/P10A9/1PSWF0005/P10A9_1PSW_F0005_S_OOO_MDF.jpg",
        rating: 5.0,
        discount: false,
        description: "An architectural evening gown blending sustainable Re-Nylon with heavy silk satin, featuring a draped back silhouette and metal triangle logo badge.",
        sizes: ["36", "38", "40"],
        colors: ["Black"],
        inStock: true,
        tags: ["prada", "gown", "re-nylon", "silk", "evening"]
    },

    {
        id: 32,
        name: "Prada Single-Breasted Velvet Tailored Jacket",
        brand: "Prada",
        category: "Women",
        subcategory: "Outerwear",
        price: 3800.00,
        oldPrice: 4200.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P25/P25O44/6289F0QV1/P25O44_6289_F0QV1_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P25/P25O44/6289F0QV1/P25O44_6289_F0QV1_S_OOO_MDF.jpg",
        rating: 4.8,
        discount: true,
        description: "Tailored in plush cotton velvet with peak lapels and horn buttons. Designed with narrow shoulders and a nipped waist for a contoured silhouette.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Midnight Navy", "Black"],
        inStock: true,
        tags: ["prada", "jacket", "velvet", "blazer", "outerwear"]
    },

    {
        id: 33,
        name: "Prada Double Wool Gabardine Trench Coat",
        brand: "Prada",
        category: "Women",
        subcategory: "Outerwear",
        price: 4900.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P25/P256KH/17LKF0008/P256KH_17LK_F0008_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P25/P256KH/17LKF0008/P256KH_17LK_F0008_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: false,
        description: "Classic double-breasted trench coat tailored in water-repellent double wool gabardine with leather-buckled waist belt and epaulettes.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Beige", "Black"],
        inStock: true,
        tags: ["prada", "trench", "coat", "gabardine", "outerwear"]
    },

    {
        id: 34,
        name: "Prada Oversized Nappa Leather Biker Jacket",
        brand: "Prada",
        category: "Women",
        subcategory: "Outerwear",
        price: 6200.00,
        oldPrice: 6800.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P25/P25O40/6152F0031/P25O40_6152_F0031_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P25/P25O40/6152F0031/P25O40_6152_F0031_S_OOO_MDF.jpg",
        rating: 5.0,
        discount: true,
        description: "Crafted from hand-waxed vintage-look Nappa leather. Oversized biker jacket featuring asymmetrical zips, polished chrome hardware, and enamelled triangle logo.",
        sizes: ["36", "38", "40"],
        colors: ["Cognac Brown", "Black"],
        inStock: true,
        tags: ["prada", "leather", "biker", "jacket", "outerwear"]
    },

    {
        id: 35,
        name: "Prada Silk Twill Printed Bow Top",
        brand: "Prada",
        category: "Women",
        subcategory: "Tops",
        price: 1950.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T00R/120MF0002/P3T00R_120M_F0002_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T00R/120MF0002/P3T00R_120M_F0002_S_OOO_MDF.jpg",
        rating: 4.7,
        discount: false,
        description: "Pure silk twill sleeveless top styled with a lavallière neck collar bow and vintage Prada archive print.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Print / Multi"],
        inStock: true,
        tags: ["prada", "top", "silk", "blouse", "women"]
    },

    {
        id: 36,
        name: "Prada Fine Cashmere Knit Cardigan",
        brand: "Prada",
        category: "Women",
        subcategory: "Tops",
        price: 2400.00,
        oldPrice: 2750.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P46/P465JR/1XV2F0M10/P465JR_1XV2_F0M10_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P46/P465JR/1XV2F0M10/P465JR_1XV2_F0M10_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: true,
        description: "Luxurious featherweight pure cashmere button-front cardigan with mother-of-pearl buttons and micro knit triangle chest emblem.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Camel", "Grey", "Black"],
        inStock: true,
        tags: ["prada", "cashmere", "cardigan", "knitwear", "tops"]
    },

    {
        id: 37,
        name: "Prada Angora Blend Cropped Sweater",
        brand: "Prada",
        category: "Women",
        subcategory: "Tops",
        price: 1850.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P47/P471JR/190JF0442/P471JR_190J_F0442_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P47/P471JR/190JF0442/P471JR_190J_F0442_S_OOO_MDF.jpg",
        rating: 4.8,
        discount: false,
        description: "Soft fluffy angora wool blend crew-neck cropped sweater styled with ribbed trims and relaxed dropped shoulders.",
        sizes: ["36", "38", "40"],
        colors: ["Blush Pink", "Cream"],
        inStock: true,
        tags: ["prada", "angora", "sweater", "knitwear", "tops"]
    },

    {
        id: 38,
        name: "Prada Organza Sheer Layered Shirt",
        brand: "Prada",
        category: "Women",
        subcategory: "Tops",
        price: 2100.00,
        oldPrice: 2400.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P93/P937OR/101RF0E18/P937OR_101R_F0E18_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P93/P937OR/101RF0E18/P937OR_101R_F0E18_S_OOO_MDF.jpg",
        rating: 4.7,
        discount: true,
        description: "Ethereal sheer silk organza button-up shirt featuring sharp pointed collar, breast pocket, and slip liner.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Pastel Yellow", "White"],
        inStock: true,
        tags: ["prada", "organza", "shirt", "sheer", "tops"]
    },

    {
        id: 39,
        name: "Prada Heavy Silk Satin Wrap Top",
        brand: "Prada",
        category: "Women",
        subcategory: "Tops",
        price: 1750.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P3S/P3S73R/155HF0009/P3S73R_155H_F0009_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P3S/P3S73R/155HF0009/P3S73R_155H_F0009_S_OOO_MDF.jpg",
        rating: 4.8,
        discount: false,
        description: "Lustrous heavy silk satin wrap blouse with side tie closure and V-neck collar.",
        sizes: ["36", "38", "40"],
        colors: ["White", "Black"],
        inStock: true,
        tags: ["prada", "silk", "satin", "wrap top", "tops"]
    },

    {
        id: 40,
        name: "Prada Printed Poplin Short-Sleeve Blouse",
        brand: "Prada",
        category: "Women",
        subcategory: "Tops",
        price: 1350.00,
        oldPrice: 1600.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/5/570/57076/15PYF0009/57076_15PY_F0009_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/5/570/57076/15PYF0009/57076_15PY_F0009_S_OOO_MDL.jpg",
        rating: 4.6,
        discount: true,
        description: "Crisp cotton poplin boxy shirt printed with geometric motif and finished with enamelled metal triangle badge.",
        sizes: ["36", "38", "40", "42"],
        colors: ["White / Print"],
        inStock: true,
        tags: ["prada", "poplin", "blouse", "shirt", "tops"]
    },

    {
        id: 41,
        name: "Prada Bull Denim Oversized Jacket",
        brand: "Prada",
        category: "Women",
        subcategory: "Outerwear",
        price: 2600.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/G/GFB/GFB340/19VIF0008/GFB340_19VI_F0008_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/G/GFB/GFB340/19VIF0008/GFB340_19VI_F0008_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: false,
        description: "Boxy Japanese bull denim jacket treated with vintage wash and featuring triangle fabric logo patch on back.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Indigo Blue"],
        inStock: true,
        tags: ["prada", "denim", "jacket", "outerwear"]
    },

    {
        id: 42,
        name: "Prada Re-Nylon Padded Down Jacket",
        brand: "Prada",
        category: "Women",
        subcategory: "Outerwear",
        price: 3400.00,
        oldPrice: 3800.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/3/395/39576L/14L0F0276/39576L_14L0_F0276_S_WMO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/3/395/39576L/14L0F0276/39576L_14L0_F0276_S_WMO_MDF.jpg",
        rating: 5.0,
        discount: true,
        description: "Goose down filled puffer jacket crafted from signature regenerated Re-Nylon fabric with detachable hood.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Ice Blue", "Black"],
        inStock: true,
        tags: ["prada", "re-nylon", "down jacket", "puffer", "outerwear"]
    },

    {
        id: 43,
        name: "Prada High-Waisted Wide-Leg Wool Trousers",
        brand: "Prada",
        category: "Women",
        subcategory: "Bottoms",
        price: 1850.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P27/P270K/120MF0D65/P270K_120M_F0D65_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P27/P270K/120MF0D65/P270K_120M_F0D65_S_OOO_MDF.jpg",
        rating: 4.8,
        discount: false,
        description: "Tailored high-waisted trousers in double wool fabric with wide-leg volume and sharp front ironed creases.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Granite Grey", "Black"],
        inStock: true,
        tags: ["prada", "trousers", "wide-leg", "wool", "bottoms"]
    },

    {
        id: 44,
        name: "Prada Re-Nylon Circular Pleated Midi Skirt",
        brand: "Prada",
        category: "Women",
        subcategory: "Bottoms",
        price: 1950.00,
        oldPrice: 2200.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P10/P10D8/6505F0002/P10D8_6505_F0002_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P10/P10D8/6505F0002/P10D8_6505_F0002_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: true,
        description: "Sculptural flared midi skirt in Re-Nylon with crisp accordion pleats and enamelled metal triangle buckle.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Black"],
        inStock: true,
        tags: ["prada", "skirt", "re-nylon", "pleated", "bottoms"]
    },

    {
        id: 45,
        name: "Prada Vintage Denim Straight Jeans",
        brand: "Prada",
        category: "Women",
        subcategory: "Bottoms",
        price: 1250.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/G/GFP/GFP541/19VIF0008/GFP541_19VI_F0008_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/G/GFP/GFP541/19VIF0008/GFP541_19VI_F0008_S_OOO_MDF.jpg",
        rating: 4.7,
        discount: false,
        description: "Five-pocket straight-leg jeans in organic denim with washed finish and enamel logo on coin pocket.",
        sizes: ["25", "26", "27", "28", "29", "30"],
        colors: ["Washed Indigo"],
        inStock: true,
        tags: ["prada", "denim", "jeans", "bottoms"]
    },

    {
        id: 46,
        name: "Prada Re-Nylon Technical Active Leggings",
        brand: "Prada",
        category: "Women",
        subcategory: "Activewear",
        price: 980.00,
        oldPrice: 1150.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/2/292/292387/1WQ8F0324/292387_1WQ8_F0324_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/2/292/292387/1WQ8F0324/292387_1WQ8_F0324_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: true,
        description: "High-performance seamless leggings in breathable stretch Re-Nylon knit with heat-sealed Prada Linea Rossa logo.",
        sizes: ["XS", "S", "M", "L"],
        colors: ["Rubber Gray", "Black"],
        inStock: true,
        tags: ["prada", "leggings", "linea rossa", "re-nylon", "activewear"]
    },

    {
        id: 47,
        name: "Prada Linea Rossa Tech Crop Top",
        brand: "Prada",
        category: "Women",
        subcategory: "Activewear",
        price: 780.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/1/132/132419/6103F0AK9/132419_6103_F0AK9_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/1/132/132419/6103F0AK9/132419_6103_F0AK9_S_OOO_MDF.jpg",
        rating: 4.8,
        discount: false,
        description: "Ergonomic compression crop top from Prada Linea Rossa line with red rubberized chest logo stripe.",
        sizes: ["XS", "S", "M", "L"],
        colors: ["Anthracite / Red"],
        inStock: true,
        tags: ["prada", "linea rossa", "activewear", "crop top"]
    },

    {
        id: 48,
        name: "Prada Linea Rossa Windbreaker Zip Jacket",
        brand: "Prada",
        category: "Women",
        subcategory: "Activewear",
        price: 2200.00,
        oldPrice: 2500.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T60/6685F0009/P3T60_6685_F0009_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T60/6685F0009/P3T60_6685_F0009_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: true,
        description: "Lightweight windproof active jacket with taped seams, adjustable hood, and rubberized Linea Rossa badge.",
        sizes: ["XS", "S", "M", "L"],
        colors: ["White", "Black"],
        inStock: true,
        tags: ["prada", "linea rossa", "jacket", "windbreaker", "activewear"]
    },

    {
        id: 49,
        name: "Rolex Oyster Perpetual Steel & Gold Watch",
        brand: "Rolex",
        category: "Accessories",
        subcategory: "Watches",
        price: 4950.00,
        oldPrice: null,
        image: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=600&auto=format&fit=crop",
        hoverImage: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop",
        rating: 5.0,
        discount: false,
        description: "Swiss automatic movement luxury timepiece in Oystersteel and 18K yellow gold with fluted bezel.",
        sizes: ["41mm"],
        colors: ["Gold/Steel"],
        inStock: true,
        tags: ["rolex", "watch", "luxury", "gold", "swiss"]
    },

    {
        id: 50,
        name: "Cartier Tank Rose Gold Leather Watch",
        brand: "Cartier",
        category: "Accessories",
        subcategory: "Watches",
        price: 2850.00,
        oldPrice: 3200.00,
        image: "https://www.cartier.com/dw/image/v2/BGTJ_PRD/on/demandware.static/-/Sites-cartier-master/default/dwd4bb06f8/images/large/e39f7697923d53ec8edcd3d44844a8a5.png?sw=750&sh=750&sm=fit&sfrm=png",
        hoverImage: "https://www.cartier.com/dw/image/v2/BGTJ_PRD/on/demandware.static/-/Sites-cartier-master/default/dw87e8ca71/images/large/4e95821d0c495d2faff283a2b5a5ade5.png?sw=750&sh=750&sm=fit&sfrm=png",
        rating: 4.9,
        discount: true,
        description: "Iconic rectangular dial watch in 18K rose gold with blue sapphire cabochon crown and alligator strap.",
        sizes: ["33mm"],
        colors: ["Rose Gold/Brown Leather"],
        inStock: true,
        tags: ["cartier", "watch", "leather", "rose gold"]
    },

    {
        id: 51,
        name: "TAG Heuer Carrera Automatic Chronograph",
        brand: "TAG Heuer",
        category: "Accessories",
        subcategory: "Watches",
        price: 1850.00,
        oldPrice: null,
        image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop",
        hoverImage: "https://images.unsplash.com/photo-1609357530491-030999908cfd?w=600&auto=format&fit=crop",
        rating: 4.8,
        discount: false,
        description: "High-precision Swiss sports chronograph with blue dial and sapphire crystal front.",
        sizes: ["42mm"],
        colors: ["Silver/Blue"],
        inStock: true,
        tags: ["tag heuer", "watch", "chronograph", "swiss"]
    },

    {
        id: 52,
        name: "18K Solid Yellow Gold Cuban Link Chain",
        brand: "LUXE Fine Jewelry",
        category: "Accessories",
        subcategory: "Chains",
        price: 890.00,
        oldPrice: 1050.00,
        image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&auto=format&fit=crop",
        hoverImage: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&auto=format&fit=crop",
        rating: 4.9,
        discount: true,
        description: "Heavy 18K solid yellow gold 6mm Miami Cuban link chain with custom lobster clasp finish.",
        sizes: ["20 inch", "22 inch", "24 inch"],
        colors: ["Yellow Gold"],
        inStock: true,
        tags: ["chain", "gold", "cuban link", "jewelry", "18k"]
    },

    {
        id: 53,
        name: "Diamond Solitaire Gold Pendant Necklace",
        brand: "LUXE Fine Jewelry",
        category: "Accessories",
        subcategory: "Necklaces",
        price: 650.00,
        oldPrice: null,
        image: "https://static.austenblake.com/clpd00004/pa0000853/detail/3d/yy/di/0001.jpg",
        hoverImage: "https://static.austenblake.com/clpd00004/pa0000853/detail/model/yy/di/0001.jpg",
        rating: 4.8,
        discount: false,
        description: "0.75 carat round brilliant lab-grown diamond set in 14K solid yellow gold chain necklace.",
        sizes: ["18 inch"],
        colors: ["Yellow Gold"],
        inStock: true,
        tags: ["necklace", "diamond", "gold", "pendant", "jewelry"]
    },

    {
        id: 54,
        name: "Freshwater Cultured Pearl Strand Necklace",
        brand: "LUXE Fine Jewelry",
        category: "Accessories",
        subcategory: "Necklaces",
        price: 420.00,
        oldPrice: 495.00,
        image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&auto=format&fit=crop",
        hoverImage: "https://images.unsplash.com/photo-1551163944-7f1a9ee00f1a?w=600&auto=format&fit=crop",
        rating: 4.7,
        discount: true,
        description: "Hand-strung AAA grade white freshwater pearls finished with an 18K gold ball clasp.",
        sizes: ["16 inch", "18 inch"],
        colors: ["White Pearl"],
        inStock: true,
        tags: ["pearl", "necklace", "jewelry", "classic"]
    },

    {
        id: 55,
        name: "18K Gold Chunky Huggie Hoop Earrings",
        brand: "LUXE Fine Jewelry",
        category: "Accessories",
        subcategory: "Earrings",
        price: 290.00,
        oldPrice: null,
        image: "https://m.media-amazon.com/images/I/61If5stAB4L._AC_SY675_.jpg",
        hoverImage: "https://m.media-amazon.com/images/I/812hefAsimL._AC_SY675_.jpg",
        rating: 4.8,
        discount: false,
        description: "Polished 18K solid yellow gold thick huggie hoop earrings. Ideal for daily understated elegance.",
        sizes: ["One Size"],
        colors: ["Yellow Gold"],
        inStock: true,
        tags: ["earrings", "gold", "hoops", "jewelry"]
    },

    {
        id: 56,
        name: "Brilliant Cut Diamond Stud Earrings",
        brand: "LUXE Fine Jewelry",
        category: "Accessories",
        subcategory: "Earrings",
        price: 580.00,
        oldPrice: 699.00,
        image: "https://static.austenblake.com/cler00010/ea0000103/detail/3d/ww/di/0001.jpg",
        hoverImage: "https://static.austenblake.com/cler00010/ea0000103/detail/down/ww/di/0001.jpg",
        rating: 4.9,
        discount: true,
        description: "Total 1.0 ctw lab-grown brilliant diamonds set in four-prong 14K white gold friction backs.",
        sizes: ["One Size"],
        colors: ["White Gold"],
        inStock: true,
        tags: ["earrings", "diamond", "studs", "jewelry"]
    },

    {
        id: 57,
        name: "Gucci GG Marmont Matelassé Shoulder Bag",
        brand: "Gucci",
        category: "Accessories",
        subcategory: "Bags",
        price: 1490.00,
        oldPrice: null,
        image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&auto=format&fit=crop",
        hoverImage: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=600&auto=format&fit=crop",
        rating: 4.9,
        discount: false,
        description: "Quilted leather shoulder bag featuring GG gold hardware double closure and chain strap.",
        sizes: ["One Size"],
        colors: ["Black", "Dusty Pink", "Red"],
        inStock: true,
        tags: ["gucci", "bag", "marmont", "leather", "luxury"]
    },

    {
        id: 58,
        name: "Lacoste All-Over Print Messenger Bag",
        brand: "Lacoste",
        category: "Accessories",
        subcategory: "Bags",
        price: 65.00,
        oldPrice: 85.00,
        image: "https://cdn-images.farfetch-contents.com/20/98/00/52/20980052_51122629_1000.jpg",
        hoverImage: "https://i.pinimg.com/1200x/3d/1e/9e/3d1e9ea22065967826a63efb8716abc4.jpg",
        rating: 4.5,
        discount: true,
        description: "Durable cross-body messenger bag with iconic Lacoste crocodile crest and adjustable webbed strap.",
        sizes: ["One Size"],
        colors: ["Navy/White", "Black"],
        inStock: true,
        tags: ["lacoste", "messenger bag", "accessories", "bag"]
    },

    {
        id: 59,
        name: "Nike Air Max 95 Sport Backpack",
        brand: "Nike",
        category: "Accessories",
        subcategory: "Bags",
        price: 55.00,
        oldPrice: 70.00,
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop",
        hoverImage: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=600&auto=format&fit=crop",
        rating: 4.4,
        discount: true,
        description: "Multi-compartment backpack with padded air mesh back panel inspired by Air Max 95 lines.",
        sizes: ["One Size"],
        colors: ["Black", "Neon Grey"],
        inStock: true,
        tags: ["nike", "backpack", "bag", "accessories"]
    },

    {
        id: 60,
        name: "MONTIREX Ridge 32L Outdoor Backpack",
        brand: "Montirex",
        category: "Accessories",
        subcategory: "Bags",
        price: 45.00,
        oldPrice: 60.00,
        image: "https://m.media-amazon.com/images/I/714+EClSWDL._AC_SX679_.jpg",
        hoverImage: "https://m.media-amazon.com/images/I/71IT29sqt+L._AC_SX679_.jpg",
        rating: 4.6,
        discount: true,
        description: "32-liter utility backpack with padded laptop compartment, ergonomic shoulder straps, and weather-resistant exterior protection.",
        sizes: ["One Size"],
        colors: ["Black", "Olive"],
        inStock: true,
        tags: ["montirex", "backpack", "bag", "accessories"]
    },

    {
        id: 61,
        name: "Limehaus Navy Leather Gibson Shoes",
        brand: "Limehaus",
        category: "Footwear",
        subcategory: "Men",
        price: 85.00,
        oldPrice: 110.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/wlh26003_290_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/wlh26003_290_b.jpg",
        rating: 4.9,
        discount: true,
        description: "Classic navy leather Gibson dress shoes by Limehaus. Features polished smooth leather finish, blind eyelets, and durable resin sole.",
        sizes: ["40", "41", "42", "43", "44", "45"],
        colors: ["Navy Blue"],
        inStock: true,
        tags: ["shoes", "limehaus", "suit direct", "gibson", "leather", "footwear", "men"]
    },

    {
        id: 62,
        name: "Ted Baker Charcoal Slim Fit Suit Trousers",
        brand: "Ted Baker",
        category: "Men",
        subcategory: "Trousers",
        price: 89.00,
        oldPrice: 110.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb641tt_040_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb641tt_040_b.jpg",
        rating: 4.9,
        discount: true,
        description: "Dapper charcoal grey slim-fit suit trousers by Ted Baker. Crafted with crease-resistant stretch fabric and branded interior waist detailing.",
        sizes: ["30R", "32R", "34R", "36R", "38R"],
        colors: ["Charcoal Grey"],
        inStock: true,
        tags: ["trousers", "ted baker", "suit direct", "charcoal", "slim fit", "men"]
    },

    {
        id: 63,
        name: "Marc Darcy Olive Wool Blend Suit Trousers",
        brand: "Marc Darcy",
        category: "Men",
        subcategory: "Trousers",
        price: 85.00,
        oldPrice: 105.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar26133mt_650_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar26133mt_650_b.jpg",
        rating: 4.8,
        discount: true,
        description: "Tailored olive green wool-blend suit trousers by Marc Darcy. Designed with sharp front press creases and signature pocket trim accents.",
        sizes: ["30R", "32R", "34R", "36R", "38R"],
        colors: ["Olive Green"],
        inStock: true,
        tags: ["trousers", "marc darcy", "suit direct", "olive", "wool blend", "men"]
    },

    {
        id: 64,
        name: "Racing Green Light Blue Linen Suit Trousers",
        brand: "Racing Green",
        category: "Men",
        subcategory: "Trousers",
        price: 69.00,
        oldPrice: 85.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb642tt_630_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb642tt_630_b.jpg",
        rating: 4.7,
        discount: true,
        description: "Summer light blue linen-blend suit trousers by Racing Green. Lightweight, breathable, and cut with a sleek modern fit.",
        sizes: ["30R", "32R", "34R", "36R", "38R"],
        colors: ["Light Blue"],
        inStock: true,
        tags: ["trousers", "racing green", "suit direct", "linen", "blue", "men"]
    },

    {
        id: 65,
        name: "Prada Printed Silk Organza Midi Dress",
        brand: "Prada",
        category: "Women",
        subcategory: "Dresses",
        price: 3800.00,
        oldPrice: 4200.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T45R/126LF0012/P3T45R_126L_F0012_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T45R/126LF0012/P3T45R_126L_F0012_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: true,
        description: "Ethereal sheer printed silk organza dress with slip lining, round neckline, and signature Prada metal triangle logo emblem.",
        sizes: ["36", "38", "40", "42"],
        colors: ["Blue / Multi"],
        inStock: true,
        tags: ["prada", "dress", "organza", "silk", "women", "luxury"]
    },

    {
        id: 66,
        name: "Prada Heavy Satin Backless Column Dress",
        brand: "Prada",
        category: "Women",
        subcategory: "Dresses",
        price: 4200.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P3S/P3S96R/155HF0002/P3S96R_155H_F0002_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P3S/P3S96R/155HF0002/P3S96R_155H_F0002_S_OOO_MDF.jpg",
        rating: 4.8,
        discount: false,
        description: "Sleek backless evening dress in heavy duchesse silk satin. Sculptural column silhouette with delicate halter ties.",
        sizes: ["36", "38", "40"],
        colors: ["Black"],
        inStock: true,
        tags: ["prada", "dress", "satin", "evening", "gown", "women"]
    },

    {
        id: 67,
        name: "Prada Re-Nylon Utility Belted Shirt Dress",
        brand: "Prada",
        category: "Women",
        subcategory: "Dresses",
        price: 2950.00,
        oldPrice: 3300.00,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T60/6686F0009/P3T60_6686_F0009_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T60/6686F0009/P3T60_6686_F0009_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: true,
        description: "Modern utility shirt dress in regenerated Re-Nylon fabric. Features chest flap pockets, fabric waist belt, and enamelled triangle logo.",
        sizes: ["36", "38", "40", "42"],
        colors: ["White", "Black"],
        inStock: true,
        tags: ["prada", "dress", "re-nylon", "shirt dress", "women"]
    },

    {
        id: 68,
        name: "Prada Draped Georgette Cocktail Dress",
        brand: "Prada",
        category: "Women",
        subcategory: "Dresses",
        price: 3600.00,
        oldPrice: null,
        image: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T69/6618F0002/P3T69_6618_F0002_S_OOO_SLF.jpg",
        hoverImage: "https://www.prada.com/content/dam/pradabkg_products/P/P3T/P3T69/6618F0002/P3T69_6618_F0002_S_OOO_MDF.jpg",
        rating: 4.9,
        discount: false,
        description: "Sophisticated cocktail dress crafted in light silk georgette with asymmetrical fluid draping and refined boat neck.",
        sizes: ["36", "38", "40"],
        colors: ["Black"],
        inStock: true,
        tags: ["prada", "dress", "georgette", "cocktail", "women"]
    },

    {
        id: 69,
        name: "Racing Green Tan Leather Brogue Shoes",
        brand: "Racing Green",
        category: "Footwear",
        subcategory: "Men",
        price: 95.00,
        oldPrice: 120.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/wrg16101_350_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/wrg16101_350_b.jpg",
        rating: 4.8,
        discount: true,
        description: "Refined tan leather wingtip brogues by Racing Green. Detailed with decorative punch hole perforations and cushioned insoles.",
        sizes: ["40", "41", "42", "43", "44", "45"],
        colors: ["Tan Brown"],
        inStock: true,
        tags: ["shoes", "racing green", "suit direct", "brogues", "leather", "footwear", "men"]
    },

    {
        id: 70,
        name: "Clarks Tan Leather Oxford Suit Shoes",
        brand: "Clarks",
        category: "Footwear",
        subcategory: "Men",
        price: 110.00,
        oldPrice: 135.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/wcf10202_350_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/wcf10202_350_b.jpg",
        rating: 4.9,
        discount: true,
        description: "Premium rich tan calfskin Oxford suit shoes by Clarks. Closed lacing system with ergonomic padded footbed for all-day wedding comfort.",
        sizes: ["40", "41", "42", "43", "44", "45"],
        colors: ["Tan"],
        inStock: true,
        tags: ["shoes", "clarks", "suit direct", "oxford", "leather", "footwear", "men"]
    },

    {
        id: 71,
        name: "Anatomic Co Brown Leather Penny Loafers",
        brand: "Anatomic Co",
        category: "Footwear",
        subcategory: "Men",
        price: 125.00,
        oldPrice: 150.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/war11434_320_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/war11434_320_b.jpg",
        rating: 4.8,
        discount: true,
        description: "Hand-stitched burnished brown leather penny loafers by Anatomic Co. Flexible rubber sole with patent Anatomic Gel Comfort technology.",
        sizes: ["40", "41", "42", "43", "44", "45"],
        colors: ["Dark Brown"],
        inStock: true,
        tags: ["shoes", "anatomic co", "suit direct", "loafers", "leather", "footwear", "men"]
    },

    {
        id: 72,
        name: "Clarks Black Leather Formal Derby Shoes",
        brand: "Clarks",
        category: "Footwear",
        subcategory: "Men",
        price: 105.00,
        oldPrice: 130.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/wcf10301_290_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/wcf10301_290_b.jpg",
        rating: 4.9,
        discount: true,
        description: "Sleek black polished leather formal Derby dress shoes by Clarks. Classic open lacing construction with non-slip treaded sole.",
        sizes: ["40", "41", "42", "43", "44", "45"],
        colors: ["Black"],
        inStock: true,
        tags: ["shoes", "clarks", "suit direct", "derby", "black", "footwear", "men"]
    },

    // ============================================================
    // ========== ADIDAS MEN'S & WOMEN'S COLLECTION (IDs 73-82) ==========
    // ============================================================

    // === Adidas Men ===
    {
        id: 73,
        name: "Adidas Ultraboost 1.0 Performance Running Shoes",
        brand: "Adidas",
        category: "Men",
        subcategory: "Footwear",
        price: 190.00,
        oldPrice: 220.00,
        image: "https://i.ebayimg.com/thumbs/images/g/ls4AAOSwghFnHVym/s-l500.jpg",
        hoverImage: "https://i.ebayimg.com/images/g/CL4AAOSwn~5nHVyx/s-l1600.webp",
        rating: 4.9,
        discount: true,
        description: "Iconic Adidas Ultraboost running shoes with Primeknit upper, responsive BOOST midsole cushioning, and Continental™ Rubber outsole.",
        sizes: ["8", "9", "10", "11", "12"],
        colors: ["Core Black", "Cloud White"],
        inStock: true,
        tags: ["adidas", "ultraboost", "sneakers", "running", "footwear", "men"]
    },

    {
        id: 74,
        name: "Adidas Tiro 23 League Training Tracksuit Pants",
        brand: "Adidas",
        category: "Men",
        subcategory: "Activewear",
        price: 65.00,
        oldPrice: 80.00,
        image: "https://images.podos.io/da7bdd11930d747368c74d476f571d88e3aba2084c308d0a.jpg.webp?w=1080&h=1080&project=kitlocker-main-site-364199&v=2",
        hoverImage: "https://images.podos.io/49ed24111f62fdc999076ccd90cc6ae2bd83becc4126568b.jpg.webp?w=1080&h=1080&project=kitlocker-main-site-364199&v=2",
        rating: 4.8,
        discount: true,
        description: "Slim-tapered soccer training track pants with moisture-absorbing AEROREADY fabric, zip pockets, and ankle zips.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Black / White Stripes", "Navy"],
        inStock: true,
        tags: ["adidas", "tiro", "tracksuit", "activewear", "bottoms", "men"]
    },

    {
        id: 75,
        name: "Adidas Originals Trefoil Essentials Fleece Hoodie",
        brand: "Adidas",
        category: "Men",
        subcategory: "Tops",
        price: 75.00,
        oldPrice: 90.00,
        image: "https://www.footasylum.com/images/products/large/4112897.jpg",
        hoverImage: "https://www.footasylum.com/images/products/large/4112897_1.jpg",
        rating: 4.7,
        discount: true,
        description: "Cosy heavyweight fleece pullover hoodie embroidered with white Trefoil logo and kangaroo front pocket.",
        sizes: ["S", "M", "L", "XL", "XXL"],
        colors: ["Grey Melange", "Black", "Royal Blue"],
        inStock: true,
        tags: ["adidas", "hoodie", "trefoil", "sweatshirt", "tops", "men"]
    },

    {
        id: 76,
        name: "Adidas Samba OG Leather Classic Sneakers",
        brand: "Adidas",
        category: "Men",
        subcategory: "Footwear",
        price: 100.00,
        oldPrice: null,
        image: "https://cdn-images.farfetch-contents.com/22/10/30/11/22103011_51862196_1000.jpg",
        hoverImage: "https://cdn-images.farfetch-contents.com/22/10/30/11/22103011_49059242_1000.jpg",
        rating: 4.9,
        discount: false,
        description: "Timeless Adidas Samba OG low-top sneakers in soft full-grain leather with suede T-toe overlay and retro gum rubber sole.",
        sizes: ["8", "9", "10", "11", "12"],
        colors: ["Cloud White / Core Black", "Black / White"],
        inStock: true,
        tags: ["adidas", "samba", "sneakers", "footwear", "men", "classics"]
    },

    {
        id: 77,
        name: "Adidas Essentials 3-Stripes Windbreaker Jacket",
        brand: "Adidas",
        category: "Men",
        subcategory: "Outerwear",
        price: 85.00,
        oldPrice: 100.00,
        image: "https://cdn-images.farfetch-contents.com/36/41/76/97/36417697_68455637_1000.jpg",
        hoverImage: "https://cdn-images.farfetch-contents.com/36/41/76/97/36417697_68455503_1000.jpg",
        rating: 4.8,
        discount: true,
        description: "Lightweight weather-resistant full-zip windbreaker jacket featuring iconic 3-Stripes along sleeves and high stand collar.",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Black / White", "Navy"],
        inStock: true,
        tags: ["adidas", "windbreaker", "jacket", "outerwear", "men"]
    },

    // === Adidas Women ===
    {
        id: 78,
        name: "Adidas Originals Gazelle Bold Platform Sneakers",
        brand: "Adidas",
        category: "Women",
        subcategory: "Footwear",
        price: 120.00,
        oldPrice: 140.00,
        image: "https://cdn-images.farfetch-contents.com/23/70/60/47/23706047_53613814_1000.jpg",
        hoverImage: "https://cdn-images.farfetch-contents.com/23/70/60/47/23706047_53613807_1000.jpg",
        rating: 4.9,
        discount: true,
        description: "Statement platform edition of the classic Gazelle in soft suede with triple-stacked gum rubber platform outsole.",
        sizes: ["5", "6", "7", "8", "9"],
        colors: ["Pink Glow", "Core Black", "Sand Strata"],
        inStock: true,
        tags: ["adidas", "gazelle", "platform", "sneakers", "footwear", "women"]
    },

    {
        id: 79,
        name: "Adidas Techfit High-Waisted Training Leggings",
        brand: "Adidas",
        category: "Women",
        subcategory: "Activewear",
        price: 70.00,
        oldPrice: 85.00,
        image: "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?w=600&auto=format&fit=crop",
        hoverImage: "https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?w=600&auto=format&fit=crop",
        rating: 4.8,
        discount: true,
        description: "High-compression Techfit training tights designed with supportive high-rise waistband and moisture-wicking AEROREADY.",
        sizes: ["XS", "S", "M", "L"],
        colors: ["Black", "Wonder Blue"],
        inStock: true,
        tags: ["adidas", "techfit", "leggings", "activewear", "bottoms", "women"]
    },

    {
        id: 80,
        name: "Adidas Powerimpact Medium-Support Sports Bra",
        brand: "Adidas",
        category: "Women",
        subcategory: "Activewear",
        price: 50.00,
        oldPrice: null,
        image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&auto=format&fit=crop",
        hoverImage: "https://images.unsplash.com/photo-1554412933-514a83d2f3c8?w=600&auto=format&fit=crop",
        rating: 4.7,
        discount: false,
        description: "Sleek pullover sports bra providing medium support for gym workouts, featuring breathable mesh back panel.",
        sizes: ["XS", "S", "M", "L"],
        colors: ["Black", "White"],
        inStock: true,
        tags: ["adidas", "sports bra", "activewear", "women"]
    },

    {
        id: 81,
        name: "Adidas Originals Oversized Trefoil Sweatshirt",
        brand: "Adidas",
        category: "Women",
        subcategory: "Tops",
        price: 80.00,
        oldPrice: 95.00,
        image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&auto=format&fit=crop",
        hoverImage: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop",
        rating: 4.8,
        discount: true,
        sizes: ["XS", "S", "M", "L"],
        colors: ["Hazy Rose", "Black"],
        inStock: true,
        tags: ["adidas", "sweatshirt", "trefoil", "tops", "women"]
    },

    {
        id: 82,
        name: "Adidas Always Original Pleated Track Skirt",
        brand: "Adidas",
        category: "Women",
        subcategory: "Bottoms",
        price: 75.00,
        oldPrice: 90.00,
        image: "https://xcdn.next.co.uk/common/items/default/default/itemimages/3_4Ratio/product/lge/Y38399s.jpg?im=Resize,width=480",
        hoverImage: "https://xcdn.next.co.uk/common/items/default/default/itemimages/3_4Ratio/product/lge/Y38399s3.jpg?im=Resize,width=480",
        rating: 4.7,
        discount: true,
        description: "Sporty chic pleated tennis skirt with elasticated 3-Stripes waistband and built-in inner shorts for full coverage.",
        sizes: ["XS", "S", "M", "L"],
        colors: ["Cloud White", "Core Black"],
        inStock: true,
        tags: ["adidas", "skirt", "track skirt", "bottoms", "women"]
    },

    // ============================================================
    // ========== SUIT DIRECT BLAZERS COLLECTION (IDs 83-87) ==========
    // ============================================================

    {
        id: 83,
        name: "Ted Baker Olive Tweed Wool Blend Blazer",
        brand: "Ted Baker",
        category: "Men",
        subcategory: "Suits",
        price: 199.00,
        oldPrice: 249.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb694jt_650_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb694jt_650_b.jpg",
        rating: 4.9,
        discount: true,
        description: "Tailored olive green tweed wool-blend blazer jacket by Ted Baker. Features notch lapels, flap pockets, and signature patterned lining.",
        sizes: ["38R", "40R", "42R", "44R", "46R"],
        colors: ["Olive Green"],
        inStock: true,
        tags: ["blazer", "ted baker", "suit direct", "tweed", "wool", "men"]
    },

    {
        id: 84,
        name: "Ted Baker Light Blue Check Tailored Blazer",
        brand: "Ted Baker",
        category: "Men",
        subcategory: "Suits",
        price: 189.00,
        oldPrice: 235.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb684jt_170_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb684jt_170_b.jpg",
        rating: 4.8,
        discount: true,
        description: "Summer light blue windowpane check tailored blazer jacket from Ted Baker. Single-breasted two-button closure with lapel pin.",
        sizes: ["38R", "40R", "42R", "44R"],
        colors: ["Light Blue Check"],
        inStock: true,
        tags: ["blazer", "ted baker", "suit direct", "check", "blue", "men"]
    },

    {
        id: 85,
        name: "Ted Baker Tan Hopsack Wool Suit Blazer",
        brand: "Ted Baker",
        category: "Men",
        subcategory: "Suits",
        price: 179.00,
        oldPrice: 220.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb686jt_351_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/tb686jt_351_b.jpg",
        rating: 4.7,
        discount: true,
        description: "Classic tan hopsack wool tailored blazer jacket by Ted Baker. Breathable textured weave with contrast buttonhole stitching.",
        sizes: ["38R", "40R", "42R", "44R", "46R"],
        colors: ["Tan Brown"],
        inStock: true,
        tags: ["blazer", "ted baker", "suit direct", "hopsack", "tan", "men"]
    },

    {
        id: 86,
        name: "Marc Darcy Navy Slim Fit Tuxedo Blazer",
        brand: "Marc Darcy",
        category: "Men",
        subcategory: "Suits",
        price: 215.00,
        oldPrice: 260.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar24281js_290_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar24281js_290_b.jpg",
        rating: 4.9,
        discount: true,
        description: "Dapper midnight navy slim-fit velvet lapel tuxedo blazer jacket by Marc Darcy. Designed for evening galas and formal events.",
        sizes: ["38R", "40R", "42R", "44R"],
        colors: ["Midnight Navy"],
        inStock: true,
        tags: ["blazer", "marc darcy", "suit direct", "tuxedo", "navy", "men"]
    },

    {
        id: 87,
        name: "Gibson London Charcoal Textured Wool Blazer",
        brand: "Gibson London",
        category: "Men",
        subcategory: "Suits",
        price: 195.00,
        oldPrice: 240.00,
        image: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar25124mj_021_a.jpg",
        hoverImage: "https://cdn.suitdirect.co.uk/upload/siteimages/large/ar25124mj_021_b.jpg",
        rating: 4.8,
        discount: true,
        description: "Tailored charcoal grey textured wool blazer jacket by Gibson London. Crafted with peak lapels and branded horn buttons.",
        sizes: ["38R", "40R", "42R", "44R", "46R"],
        colors: ["Charcoal Grey"],
        inStock: true,
        tags: ["blazer", "gibson london", "suit direct", "charcoal", "wool", "men"]
    }
];

// ========== SHARED, SERVER-SIDE CATALOG (Supabase) ==========
// ==============================================================
// The array above (`products`) is now only a FALLBACK / starter
// seed — used if Supabase isn't reachable, and used once to
// import your original 90 products into the real database via
// the admin panel's "Import starter catalog" button.
//
// The real source of truth is the `products` table in Supabase.
// Every visitor's browser fetches the same data from there, so
// when you add/edit/delete a product in the admin panel, EVERY
// visitor sees it — not just your own browser (that was the old
// localStorage bug).
//
// window.productsReady is a Promise that resolves once the catalog
// has loaded. Any page script that reads `products`/getProducts()
// on page load should `await window.productsReady;` first (already
// wired up in cart.js, wishlist.js, search.js, app.js, shop.js,
// category.js, product.js, checkout.js).

let activeProductsList = products; // synchronous fallback until fetch resolves

window.productsReady = (async function loadCatalog() {
    try {
        if (window.LuxeProducts && window.isSupabaseConfigured && window.isSupabaseConfigured()) {
            const { data, error } = await window.LuxeProducts.getAll();
            if (!error && data && data.length) {
                activeProductsList = data;
            } else if (!error && data && data.length === 0) {
                // Table exists but is empty (fresh install) — keep the
                // bundled fallback list so the storefront isn't blank.
                console.warn('LUXE: products table is empty — showing bundled fallback catalog. Use the admin panel to import it.');
            } else if (error) {
                console.warn('LUXE: could not load products from Supabase, showing offline fallback catalog.', error.message || error);
            }
        }
    } catch (e) {
        console.warn('LUXE: product fetch failed, showing offline fallback catalog.', e);
    }
    return activeProductsList;
})();

// Get ALL products
function getProducts() {
    return activeProductsList;
}

// Get a SINGLE product by its ID
function getProductById(id) {
    const numId = Number(id);
    return activeProductsList.find(p => p.id === numId);
}

// Get products by category (Men, Women, Accessories, Footwear)
function getProductsByCategory(category) {
    return activeProductsList.filter(p => p.category.toLowerCase() === category.toLowerCase());
}

// Get ONLY Men's products
function getMenProducts() {
    return activeProductsList.filter(p => p.category === "Men");
}

// Get ONLY Women's products
function getWomenProducts() {
    return activeProductsList.filter(p => p.category === "Women");
}

// Get featured products (first 8)
function getFeaturedProducts() {
    return activeProductsList.slice(0, 8);
}

// Get new arrivals (last 8)
function getNewArrivals() {
    return activeProductsList.slice(-8);
}

// Search products by name, brand, category, or tags
function searchProducts(query) {
    const q = query.toLowerCase().trim();
    return activeProductsList.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.subcategory && p.subcategory.toLowerCase().includes(q)) ||
        (p.tags && p.tags.some(tag => tag.includes(q)))
    );
}

// ---------------------------------------------------------------------
// Admin-only writes below. These talk to Supabase directly and will
// fail (safely, with an error object) for anyone who isn't logged in
// as the owner — that's enforced by database Row Level Security, not
// by this file. The admin panel (js/admin.js) is what calls these.
// ---------------------------------------------------------------------

// Add a new product. Returns { data, error }.
async function addProduct(productData) {
    if (!window.LuxeProducts) return { data: null, error: { message: 'Backend not configured' } };
    const { data, error } = await window.LuxeProducts.create(productData);
    if (!error && data) {
        activeProductsList = [data, ...activeProductsList];
    }
    return { data, error };
}

// Update existing product. Returns { data, error }.
async function updateProduct(id, updatedData) {
    if (!window.LuxeProducts) return { data: null, error: { message: 'Backend not configured' } };
    const { data, error } = await window.LuxeProducts.update(id, updatedData);
    if (!error && data) {
        const numId = Number(id);
        activeProductsList = activeProductsList.map(p => p.id === numId ? data : p);
    }
    return { data, error };
}

// Delete product. Returns { error }.
async function deleteProduct(id) {
    if (!window.LuxeProducts) return { error: { message: 'Backend not configured' } };
    const { error } = await window.LuxeProducts.remove(id);
    if (!error) {
        const numId = Number(id);
        activeProductsList = activeProductsList.filter(p => p.id !== numId);
    }
    return { error };
}

// One-time import of the bundled starter catalog into Supabase.
// Used by the admin panel's "Import starter catalog" button.
async function importStarterCatalog() {
    if (!window.LuxeProducts) return { error: { message: 'Backend not configured' } };
    const result = await window.LuxeProducts.importStarterCatalog(products);
    if (!result.error) {
        // Refresh local cache from the DB so the admin panel shows the
        // freshly imported rows immediately.
        const { data, error } = await window.LuxeProducts.getAll();
        if (!error && data) activeProductsList = data;
    }
    return result;
}

if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'products', {
        get: function () { return activeProductsList; },
        set: function (val) { activeProductsList = val; },
        configurable: true
    });
    window.getProducts = getProducts;
    window.getProductById = getProductById;
    window.getProductsByCategory = getProductsByCategory;
    window.getMenProducts = getMenProducts;
    window.getWomenProducts = getWomenProducts;
    window.getFeaturedProducts = getFeaturedProducts;
    window.getNewArrivals = getNewArrivals;
    window.searchProducts = searchProducts;
    window.addProduct = addProduct;
    window.updateProduct = updateProduct;
    window.deleteProduct = deleteProduct;
    window.importStarterCatalog = importStarterCatalog;
}
