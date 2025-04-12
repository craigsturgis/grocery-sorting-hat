// Test script for the Walmart receipt parser

// Parser for Walmart format
function parseWalmartGroceryList(text) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const items = [];

  let currentItem = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip "Shopped" header and cart/review button lines
    if (
      line === "Shopped" ||
      line === "Add to cart" ||
      line === "Review item" ||
      line === "" ||
      line === "Approved substitution" ||
      line === "Weight-adjusted"
    ) {
      continue;
    }

    // Skip Walmart Cash line
    if (line.includes("Walmart Cash")) {
      continue;
    }

    // Skip standalone numbers (like "2", "3", "4") that appear in the receipt
    if (/^\d+$/.test(line)) {
      continue;
    }

    // Handle standard price line (standalone price)
    if (line.match(/^\$\d+\.\d+$/)) {
      const priceMatch = line.match(/\$(\d+\.\d+)/);

      if (priceMatch && currentItem) {
        currentItem.price = parseFloat(priceMatch[1]);

        // Add the current item to our list and reset
        items.push({
          name: currentItem.name,
          price: currentItem.price,
        });
        currentItem = null;
      }
      continue;
    }

    // Handle per lb price format (e.g., "$5.75/lb")
    if (line.match(/\$\d+\.\d+\/lb/)) {
      // This is a unit price line, not the total price
      continue;
    }

    // Handle "Discount price $X.XX" format
    if (line.match(/Discount price \$\d+\.\d+/)) {
      const priceMatch = line.match(/\$(\d+\.\d+)/);
      if (priceMatch && currentItem) {
        currentItem.price = parseFloat(priceMatch[1]);

        // Skip the next "Was $X.XX" line
        if (i + 1 < lines.length && lines[i + 1].match(/Was \$\d+\.\d+/)) {
          i++;
        }

        // Skip any additional price line
        if (i + 1 < lines.length && lines[i + 1].match(/^\$\d+\.\d+$/)) {
          i++;
        }

        // Add item and reset
        items.push({
          name: currentItem.name,
          price: currentItem.price,
        });
        currentItem = null;
      }
      continue;
    }

    // Handle savings line and skip it
    if (line.match(/\$\d+\.\d+\s+from savings/)) {
      continue;
    }

    // Handle price with "Was" format
    if (
      line.match(/\$\d+\.\d+\s+Was \$\d+\.\d+/) ||
      line.match(/Was \$\d+\.\d+/) ||
      line.match(/\$\d+\.\d+$/)
    ) {
      // Get the first price mentioned (current price, not "Was" price)
      const priceMatch = line.match(/\$(\d+\.\d+)/);
      if (priceMatch && currentItem) {
        currentItem.price = parseFloat(priceMatch[1]);

        // Add the current item to our list and reset
        items.push({
          name: currentItem.name,
          price: currentItem.price,
        });
        currentItem = null;
      }
      continue;
    }

    // Handle multiple items with individual prices (e.g., "Qty 2 $8.28 $4.14 ea")
    if (line.match(/Qty \d+\s+\$\d+\.\d+/)) {
      const priceMatch = line.match(/\$(\d+\.\d+)/);

      if (priceMatch && currentItem) {
        // Use the total price, not the individual price
        currentItem.price = parseFloat(priceMatch[1]);

        // Add the current item to our list and reset
        items.push({
          name: currentItem.name,
          price: currentItem.price,
        });
        currentItem = null;
      }
      continue;
    }

    // Skip quantity, multipack, count, and unit price lines
    if (
      line.match(/^Qty \d+$/) ||
      line.match(/^Multipack Quantity: \d+$/) ||
      line.match(/^Count: \d+$/) ||
      line.match(/^Count Per Pack: \d+$/) ||
      line.match(/^\d+\.\d+¢\/[a-z]+$/) ||
      line.match(/\$\d+\.\d+\/[a-z]+/) ||
      line.match(/\$\d+\.\d+ ea/) ||
      line.match(/^Size: \d+$/) ||
      line.match(/^Actual Color: [A-Za-z]+$/)
    ) {
      continue;
    }

    // If we have any line that doesn't match above patterns and isn't a price, it's likely a product name
    if (!line.match(/\$\d+\.\d+/) && !currentItem) {
      currentItem = {
        name: line,
        price: null,
      };
    }
  }

  // Don't forget to add the last item if it exists
  if (currentItem && currentItem.price !== null) {
    items.push({
      name: currentItem.name,
      price: currentItem.price,
    });
  }

  return items;
}

// Sample receipt text
const receiptText = `Goldfish Pretzel Crackers, 12 oz Bag
Qty 1
$3.52

Add to cart
Review item
Approved substitution

CHI-CHI'S Flour Tortillas Street Taco Size, Shelf Stable, 9oz Resealable Package, (10 Count)
Multipack Quantity: 1
Qty 1
$1.54

Add to cart
Review item
Approved substitution

Great Value Low-Moisture Part-Skim Mozzarella Cheese, 16 oz Block (Plastic Packaging)
Qty 1
$4.22

Add to cart
Review item
Weight-adjusted

Fresh Banana, Each
50.0¢/lb
Qty 4
$0.12 from savings
$0.68
Was $0.80
$0.80

Add to cart
Review item
Shopped

Minute Instant White Rice, Light and Fluffy, Gluten Free, 14 oz
Multipack Quantity: 1
17.6¢/oz
Qty 1
$2.46

Add to cart
Review item

Kellogg's Crispix Cold Breakfast Cereal, 8 Vitamins and Minerals, Family Size, Original, 18oz Box (1 Box)
Multipack Quantity: 1
27.7¢/oz
Qty 1
$4.98

Add to cart
Review item

Sunbelt Bakery Chocolate Chip Chewy Granola Bars, 10 Bars, 11.26 oz
28.1¢/oz
Qty 2
Walmart Cash Logo
Walmart Cash added
$6.36
$3.18 ea

Add to cart
Review item

Great Value Distilled Water, 1 Gallon Jug
Multipack Quantity: 1
1.1¢/fl oz
Qty 2
$2.74
$1.37 ea

Add to cart
Review item

Mott's 100% Juice Original Apple Juice, 1 Gal, Bottle
4.7¢/fl oz
Qty 1
$5.97

Add to cart
Review item

Swanson 100% Natural Chicken Broth, 48 oz Carton
Multipack Quantity: 1
7.7¢/oz
Qty 1
$3.68

Add to cart
Review item

Old El Paso Taco Seasoning, Mild, Easy Meal Prep, 1 oz.
Count Per Pack: 1
97.0¢/oz
Qty 1
$0.97

Add to cart
Review item

Mott's No Sugar Added Applesauce, 3.2 oz, 12 Count Clear Pouches
Multipack Quantity: 1
19.4¢/oz
Qty 1
$7.46

Add to cart
Review item

Rain-X -20F 2-In-1 All-Season Washer Fluid
Multipack Quantity: 1
3.1¢/fl oz
Qty 1
$3.97

Add to cart
Review item

Great Value Pure Maple Syrup, 12.5 fl oz
Multipack Quantity: 1
63.8¢/fl oz
Qty 1
$7.98

Add to cart
Review item

Rubbermaid TakeAlongs Food Storage Containers, 10 Piece Set, Red
Size: 10
Multipack Quantity: 1
$5.98/ea
Qty 1
$5.98

Add to cart
Review item

Rubbermaid TakeAlongs 40 Piece Food Storage Set, Red, Total of 12.6 Qts
Multipack Quantity: 1
$15.96/ea
Qty 1
$11.65 from savings
$15.96
Was $27.61
$27.61

Add to cart
Review item

Rubbermaid TakeAlongs Food Storage Containers 3.2 cup Bowls 4pk
Multipack Quantity: 1
$3.96/ea
Qty 1
$3.96

Add to cart
Review item

Rubbermaid TakeAlongs 5.2 Cup Deep Square Food Storage Container, Set of 4
Count: 4
Actual Color: Red
Qty 1
$4.74

Add to cart
Review item

WHOLLY GUACAMOLE Minis Paste, Classic, 12oz, 6 Pack
45.3¢/oz
Qty 1
$5.43

Add to cart
Review item

Freshness Guaranteed Mild Pico De Gallo, 10 oz, Gluten-Free, Refrigerated
32.6¢/oz
Qty 1
$3.26

Add to cart
Review item

Red Baron Four Cheese Deep Dish Personal Frozen Pizza, 11.2 oz 2 Pack
37.0¢/oz
Qty 2
$8.28
$4.14 ea
3
Review item

Little Bites Blueberry Muffins, 10 packs, Mini Muffins, 16.5 oz Multipack
Multipack Quantity: 10
42.3¢/oz
Qty 1
$6.98

Add to cart
Review item

80% Lean / 20% Fat Ground Beef Chuck, 1 lb Tray, Fresh, All Natural*
$6.33/lb
Qty 1
$6.33

Add to cart
Review item

Wright Brand Applewood Real Wood Smoked Thick Cut Bacon, 24 oz
$6.31/lb
Qty 1
$9.46

Add to cart
Review item

Oui by Yoplait French Style Strawberry Whole Milk Yogurt, 5 OZ Jar
31.4¢/oz
Qty 4
$6.28
$1.57 ea
4
Review item

Kraft Mexican Style Four Cheese Blend Shredded Cheese, 8 oz Bag
37.3¢/oz
Qty 1
$2.98

Add to cart
Review item

Sargento® Natural String Cheese Snacks, 12-Count
41.2¢/oz
Qty 1
$4.94

Add to cart
Review item

Broccoli Florets, 12 oz
20.6¢/oz
Qty 1
$2.47

Add to cart
Review item

Marketside Fresh Shredded Iceberg Lettuce, 8 oz Bag, Fresh
27.3¢/oz
Qty 1
$2.18

Add to cart
Review item

Marketside Hearts of Romaine Salad, 10 oz Bag, Fresh
32.4¢/oz
Qty 1
$3.24

Add to cart
Review item

Eggo Thick and Fluffy Original Waffles, Frozen Breakfast, 11.6 oz 6 Count
31.2¢/oz
Qty 2
$7.24
$3.62 ea
2
Review item

1lb Baby Peeled Carrots
6.7¢/oz
Qty 1
$1.07

Add to cart
Review item

Fresh Honeycrisp Apples, 3 lb Bag
$2.66/lb
Qty 1
$7.98

Add to cart
Review item

Fresh Mandarin Oranges, 3 lb Bag
$1.32/lb
Qty 1
$1.01 from savings
$3.97
Was $4.98
$4.98

Add to cart
Review item

Great Value, 2% Reduced Fat Milk, Gallon, Refrigerated
2.0¢/fl oz
Qty 2
$5.04
$2.52 ea`;

// Parse the receipt
const parsedItems = parseWalmartGroceryList(receiptText);

// Print the results
console.log("Parsed Items:");
console.log("=============");
parsedItems.forEach((item, index) => {
  console.log(`${index + 1}. ${item.name} - $${item.price.toFixed(2)}`);
});

console.log(`\nTotal Items: ${parsedItems.length}`);
