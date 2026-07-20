/* ============================================================
   Minecraft Item Lookup, VOL.01 theme
   Fully client-side. Curated item dataset + fuzzy search +
   one-screen item view. Icons come from static.minecraftitemids.com;
   everything else is bundled here so the tool works offline-fast.
   Class/element ids are the contract with minecraft.css + index.html.
   ============================================================ */
(function () {
  "use strict";

  var ICON = "https://static.minecraftitemids.com/128/";
  var FALLBACK = "https://static.minecraftitemids.com/128/barrier.png";
  var ITEMS_IMG = "/assets/img/minecraft/items/";   // wiki icons the CDN lacks (bundled)
  var MOB_IMG = "/assets/img/minecraft/mobs/";       // bundled mob renders
  var MOB_SND = "/assets/audio/mobs/";               // bundled mob sounds
  var TEX = "/assets/img/minecraft/textures/";       // official 1.20.2 textures (from client.jar)

  // Image fallback chain: primary src -> data-local (wiki sprite) -> barrier.
  window.__mcImgErr = function (img) {
    var loc = img.getAttribute("data-local");
    if (loc && !img.getAttribute("data-tried")) {
      img.setAttribute("data-tried", "1");
      img.src = loc;
    } else {
      img.onerror = null;
      img.src = FALLBACK;
      img.classList.add("mc-icon-missing");
    }
  };

  /* ---- Dataset ------------------------------------------------
     id      : modern namespaced id (no minecraft: prefix)
     img     : icon-CDN key (defaults to id when omitted)
     legacy  : pre-1.13 string id, or null if added after the flattening
     num     : pre-1.8 numerical id (may include :meta), or null
     stack   : max stack size (default 64)
     renew   : renewable? (bool)
     tool    : tool required to obtain, plain text
     obtain  : how you get it
     find    : where it spawns / biomes / structures
     farm    : simple farming method, or null when not farmable
     uses    : key uses (short)
     notes   : array of one-line mechanic bullets
  --------------------------------------------------------------- */
  var CURATED = [
    /* ===== Ores & minerals ===== */
    { id:"diamond", name:"Diamond", cat:"Ore & Minerals", legacy:"diamond", num:"264", renew:false,
      tool:"Iron pickaxe or better",
      obtain:"Mine Diamond Ore, loot chests, or trade with villagers.",
      find:"Deepslate layers, Y -64 to 16, most common around Y -59. Deep in caves and ravines.",
      farm:null,
      uses:"Diamond tools, armour, enchanting table, jukebox and firework stars.",
      notes:["Drops 1 diamond (more with Fortune).","Affected by Fortune, not Silk Touch when mining ore.","Needs iron pickaxe or better or it drops nothing."] },
    { id:"diamond_ore", name:"Diamond Ore", cat:"Ore & Minerals", legacy:"diamond_ore", num:"56", renew:false,
      tool:"Iron pickaxe or better",
      obtain:"Mine it underground. Silk Touch collects the ore block itself.",
      find:"Y -64 to 16 in stone; deepslate variant below Y 0.",
      farm:null,
      uses:"Source of diamonds.",
      notes:["Drops a diamond, or the block with Silk Touch.","Fortune increases diamond drops.","Gives XP when mined."] },
    { id:"iron_ingot", name:"Iron Ingot", cat:"Ore & Minerals", legacy:"iron_ingot", num:"265", renew:true,
      tool:"None (smelt raw iron)",
      obtain:"Smelt raw iron or iron ore, kill iron golems/zombies, or loot chests.",
      find:"Iron ore is common everywhere below Y 256, peaking around Y 15 and Y 232.",
      farm:"Build an iron farm with villagers + a zombie to spawn iron golems that drop ingots.",
      uses:"Tools, armour, anvils, buckets, rails, hoppers and most redstone machines.",
      notes:["Renewable via iron golem farms.","9 nuggets craft 1 ingot; 9 ingots make a block.","Golems drop 3-5 ingots on death."] },
    { id:"iron_ore", name:"Iron Ore", cat:"Ore & Minerals", legacy:"iron_ore", num:"15", renew:false,
      tool:"Stone pickaxe or better",
      obtain:"Mine it, then smelt the raw iron it drops.",
      find:"Extremely common; two peaks around Y 15 and high in mountains (Y 232).",
      farm:null,
      uses:"Smelts into iron ingots.",
      notes:["Drops raw iron (Silk Touch drops the ore).","Fortune increases raw iron drops.","Stone pickaxe or better required."] },
    { id:"gold_ingot", name:"Gold Ingot", cat:"Ore & Minerals", legacy:"gold_ingot", num:"266", renew:true,
      tool:"None (smelt raw gold)",
      obtain:"Smelt raw gold/gold ore, kill zombified piglins, barter with piglins, or loot.",
      find:"Gold ore is common in the Nether badlands (Y 32-79) and around Y -16 in the Overworld.",
      farm:"Zombified piglin farms drop gold nuggets and ingots; piglin bartering is also renewable.",
      uses:"Golden apples, clocks, powered rails, glistering melon and piglin bartering.",
      notes:["Renewable via mob farms and bartering.","Golden tools are fast but very low durability.","9 nuggets = 1 ingot."] },
    { id:"coal", name:"Coal", cat:"Ore & Minerals", legacy:"coal", num:"263", renew:true,
      tool:"Wooden pickaxe or better",
      obtain:"Mine coal ore, kill wither skeletons, or loot chests.",
      find:"The most common ore; mountains and exposed stone everywhere.",
      farm:"Wither skeletons rarely drop coal, but mining is far faster.",
      uses:"Furnace fuel (8 items each), torches, campfires and blocks of coal.",
      notes:["Charcoal is a smeltable alternative from logs.","Fortune increases drops.","One coal smelts 8 items."] },
    { id:"charcoal", name:"Charcoal", cat:"Ore & Minerals", img:"charcoal", legacy:"coal", num:"263:1", renew:true,
      tool:"None (smelt logs)",
      obtain:"Smelt any log or wood block in a furnace.",
      find:"Not found naturally; produced by smelting.",
      farm:"Fully renewable from a tree farm; charcoal can even fuel its own production.",
      uses:"Identical to coal for torches and furnace fuel, but cannot make blocks of coal.",
      notes:["Renewable, unlike coal.","Does not stack with coal.","Great early-game sustainable fuel."] },
    { id:"redstone", name:"Redstone Dust", cat:"Ore & Minerals", img:"redstone", legacy:"redstone", num:"331", renew:true,
      tool:"Iron pickaxe or better",
      obtain:"Mine redstone ore, kill witches, trade with clerics, or loot temples.",
      find:"Redstone ore is common below Y 15, peaking near bedrock.",
      farm:"Witch farms drop redstone; villager trading makes it renewable.",
      uses:"All redstone circuitry: repeaters, comparators, pistons, dispensers and more.",
      notes:["One ore drops 4-5 dust (more with Fortune).","Powers wiring and brewing (adds duration).","Silk Touch collects the ore block."] },
    { id:"lapis_lazuli", name:"Lapis Lazuli", cat:"Ore & Minerals", img:"lapis_lazuli", legacy:"dye", num:"351:4", renew:true,
      tool:"Stone pickaxe or better",
      obtain:"Mine lapis ore, trade with clerics, or loot chests.",
      find:"Lapis ore hides around Y 0 with a small bump near Y -60.",
      farm:"Renewable through cleric villager trades.",
      uses:"Required to enchant items, plus blue dye.",
      notes:["One ore drops 4-9 lapis.","Enchanting costs 1-3 lapis per level.","Fortune boosts drops."] },
    { id:"emerald", name:"Emerald", cat:"Ore & Minerals", legacy:"emerald", num:"388", renew:true,
      tool:"Iron pickaxe or better",
      obtain:"Trade with villagers (main source) or mine rare emerald ore.",
      find:"Emerald ore only generates in mountain biomes, single blocks, Y -16 to 320.",
      farm:"Villager trading halls are the practical infinite source.",
      uses:"The villager trading currency; also emerald blocks and beacons.",
      notes:["Rarest ore in single-block veins.","Renewable through trading.","Fortune increases mined drops."] },
    { id:"quartz", name:"Nether Quartz", cat:"Ore & Minerals", img:"quartz", legacy:"quartz", num:"406", renew:true,
      tool:"Wooden pickaxe or better",
      obtain:"Mine nether quartz ore or barter with piglins.",
      find:"Nether quartz ore is abundant throughout the Nether.",
      farm:"Piglin bartering yields quartz, making it renewable.",
      uses:"Daylight sensors, observers, comparators and decorative quartz blocks.",
      notes:["Drops 1 quartz (Fortune helps).","Gives XP when mined.","Common Nether building resource."] },
    { id:"netherite_ingot", name:"Netherite Ingot", cat:"Ore & Minerals", legacy:null, num:null, renew:false,
      tool:"Diamond pickaxe (for debris)",
      obtain:"Smelt ancient debris into scrap, combine 4 scrap + 4 gold ingots into a block, craft to an ingot.",
      find:"Ancient debris spawns in the Nether around Y 8-22; blast-resistant, immune to fire and lava.",
      farm:null,
      uses:"Upgrade diamond gear to netherite at a smithing table for top-tier durability.",
      notes:["1 ingot needs 4 ancient debris + 4 gold.","Netherite gear floats in lava and never burns.","Added after 1.13, so no legacy id."] },
    { id:"ancient_debris", name:"Ancient Debris", cat:"Ore & Minerals", legacy:null, num:null, renew:false,
      tool:"Diamond pickaxe or better",
      obtain:"Mine it in the Nether. Best found by TNT/bed mining a level around Y 15.",
      find:"Nether, Y 8-22, most common near Y 15. Never exposed to open caves.",
      farm:null,
      uses:"Smelts into netherite scrap for netherite gear.",
      notes:["Immune to fire and lava; never burns up.","Requires diamond pickaxe.","Blast-resistant, so it survives your explosions."] },
    { id:"copper_ingot", name:"Copper Ingot", cat:"Ore & Minerals", legacy:null, num:null, renew:true,
      tool:"Stone pickaxe or better (for ore)",
      obtain:"Smelt raw copper. Drowned also drop copper ingots.",
      find:"Copper ore is very common between Y -16 and 112, richest around Y 48.",
      farm:"Drowned farms drop copper ingots, so it is renewable.",
      uses:"Lightning rods, spyglasses, brushes and copper blocks that oxidise over time.",
      notes:["Copper blocks slowly turn green; wax to stop it.","Renewable via drowned.","Ore drops 2-5 raw copper."] },
    { id:"amethyst_shard", name:"Amethyst Shard", cat:"Ore & Minerals", legacy:null, num:null, renew:false,
      tool:"Iron pickaxe or better",
      obtain:"Mine fully-grown amethyst clusters inside geodes.",
      find:"Amethyst geodes generate underground between Y -64 and 30.",
      farm:"Budding amethyst regrows clusters, giving an effectively renewable local supply.",
      uses:"Spyglasses, tinted glass and telescopes; blocks make chime sounds.",
      notes:["Only fully-grown clusters drop shards.","Mining a cluster drops 4 shards.","Budding amethyst can't be moved, even with Silk Touch."] },

    /* ===== Blocks ===== */
    { id:"stone", name:"Stone", cat:"Blocks", legacy:"stone", num:"1", renew:false,
      tool:"Wooden pickaxe or better",
      obtain:"Smelt cobblestone, or mine stone with Silk Touch. Also forms where lava meets water.",
      find:"The bulk of the Overworld underground.",
      farm:"A lava+water stone generator produces it endlessly.",
      uses:"Stone tools, furnaces, brewing stands and huge amounts of building stock.",
      notes:["Drops cobblestone unless mined with Silk Touch.","Renewable via generators.","Base of most stone building blocks."] },
    { id:"cobblestone", name:"Cobblestone", cat:"Blocks", legacy:"cobblestone", num:"4", renew:true,
      tool:"Wooden pickaxe or better",
      obtain:"Mine stone, or make it where flowing lava meets water.",
      find:"Everywhere you mine stone; also in dungeons and strongholds.",
      farm:"A cobblestone generator gives an infinite supply.",
      uses:"Stone tools, furnaces, blast furnaces and cheap building/scaffolding.",
      notes:["Blast-resistant enough for basic mob-proofing.","Renewable via generators.","Smelts back into stone."] },
    { id:"dirt", name:"Dirt", cat:"Blocks", legacy:"dirt", num:"3", renew:false,
      tool:"None (shovel is fastest)",
      obtain:"Dig it with any tool or by hand.",
      find:"Covers most of the surface under grass.",
      farm:null,
      uses:"Farmland (hoe it), scaffolding, and grass/mushroom growth medium.",
      notes:["Hoe it into farmland for crops.","Grass and mycelium spread onto it.","Fastest with a shovel."] },
    { id:"grass_block", name:"Grass Block", cat:"Blocks", img:"grass_block", legacy:"grass", num:"2", renew:true,
      tool:"None (Silk Touch to keep it)",
      obtain:"Mine with Silk Touch, or let grass spread onto dirt.",
      find:"Surface of most Overworld biomes.",
      farm:"Grass spreads to nearby dirt in light, so it self-replenishes.",
      uses:"Lets grass, flowers and saplings-adjacent plants grow; animals graze on it.",
      notes:["Drops dirt without Silk Touch.","Spreads to adjacent dirt blocks.","Bone meal grows tall grass and flowers on it."] },
    { id:"oak_log", name:"Oak Log", cat:"Blocks", img:"oak_log", legacy:"log", num:"17", renew:true,
      tool:"None (axe is fastest)",
      obtain:"Chop trees with an axe or by hand.",
      find:"Oak trees in plains, forests and most temperate biomes.",
      farm:"Plant saplings and bone-meal them for a fast, fully renewable tree farm.",
      uses:"Planks, sticks, charcoal, and a stripped/wood-block for building.",
      notes:["1 log = 4 planks; 2 planks = 4 sticks.","Smelts into charcoal.","Renewable from saplings."] },
    { id:"oak_planks", name:"Oak Planks", cat:"Blocks", img:"oak_planks", legacy:"planks", num:"5", renew:true,
      tool:"None (axe is fastest)",
      obtain:"Craft from any oak log (1 log makes 4 planks).",
      find:"Common in village houses and shipwrecks.",
      farm:"Renewable from a tree farm.",
      uses:"Crafting tables, chests, tools, sticks, doors, boats and endless building.",
      notes:["Core early-game crafting material.","Different woods give different planks.","Fuel for furnaces (1.5 items each)."] },
    { id:"sand", name:"Sand", cat:"Blocks", legacy:"sand", num:"12", renew:false,
      tool:"None (shovel is fastest)",
      obtain:"Dig it on beaches and in deserts.",
      find:"Beaches, deserts, and riverbeds.",
      farm:null,
      uses:"Smelts into glass; crafts TNT, concrete powder and sandstone.",
      notes:["Affected by gravity; it falls.","Smelt for glass.","Shovel mines it fastest."] },
    { id:"obsidian", name:"Obsidian", cat:"Blocks", legacy:"obsidian", num:"49", renew:true,
      tool:"Diamond pickaxe or better",
      obtain:"Pour water onto a lava source, then mine the block. Also buy from villagers.",
      find:"Naturally around lava lakes and ruined portals.",
      farm:"Renewable by placing lava and flooding it repeatedly.",
      uses:"Nether portals, enchanting tables, beacons and blast-proof builds.",
      notes:["Takes ~9.4s to mine with a diamond pickaxe.","Only a diamond/netherite pickaxe drops it.","Extremely high blast resistance."] },
    { id:"glass", name:"Glass", cat:"Blocks", legacy:"glass", num:"20", renew:false,
      tool:"None (Silk Touch to keep it)",
      obtain:"Smelt sand in a furnace.",
      find:"Not naturally generated; crafted by smelting.",
      farm:null,
      uses:"Windows, beacons, glass bottles, panes and end crystals.",
      notes:["Breaks into nothing unless mined with Silk Touch.","Made from any sand type.","Stainable with dye."] },
    { id:"bookshelf", name:"Bookshelf", cat:"Blocks", legacy:"bookshelf", num:"47", renew:true,
      tool:"None (axe is fastest)",
      obtain:"Craft from 6 planks + 3 books.",
      find:"Village libraries and woodland mansions.",
      farm:"Renewable via sugar cane (paper) and leather farms.",
      uses:"Boosts an enchanting table up to level 30.",
      notes:["Place 15 around a table for max enchants.","Drops 3 books without Silk Touch.","Books need leather + paper."] },
    { id:"tnt", name:"TNT", cat:"Blocks", legacy:"tnt", num:"46", renew:true,
      tool:"None",
      obtain:"Craft from 5 gunpowder + 4 sand. Found in desert temples (as traps) and some structures.",
      find:"Desert pyramid loot traps.",
      farm:"Renewable via creeper/gunpowder farms.",
      uses:"Mining, especially bed/TNT mining ancient debris; redstone contraptions.",
      notes:["Ignite with flint & steel, redstone or fire.","Fuse is ~4 seconds.","Water stops block damage but not entity damage."] },
    { id:"crafting_table", name:"Crafting Table", cat:"Blocks", legacy:"crafting_table", num:"58", renew:true,
      tool:"None (axe is fastest)",
      obtain:"Craft from 4 planks. Generates in villages.",
      find:"Villages, and most player-built bases.",
      farm:"Renewable from a tree farm.",
      uses:"Unlocks the full 3x3 crafting grid.",
      notes:["First thing you craft in a new world.","Cheap: just 4 planks.","Villagers use them as a job site briefly."] },
    { id:"furnace", name:"Furnace", cat:"Blocks", legacy:"furnace", num:"61", renew:true,
      tool:"Wooden pickaxe or better",
      obtain:"Craft from 8 cobblestone.",
      find:"Villages and igloos.",
      farm:"Renewable via cobblestone generators.",
      uses:"Smelting ore, food and glass; a job block for smith villagers.",
      notes:["Fuel order: lava > coal/charcoal > planks.","Gives XP when you collect smelted items.","Blast furnace smelts ore twice as fast."] },
    { id:"chest", name:"Chest", cat:"Blocks", legacy:"chest", num:"54", renew:true,
      tool:"None (axe is fastest)",
      obtain:"Craft from 8 planks.",
      find:"Nearly every structure has loot chests.",
      farm:"Renewable from a tree farm.",
      uses:"27 slots of storage; two side by side form a 54-slot double chest.",
      notes:["Won't open with a solid block on top.","Cats sit on closed chests.","Hoppers can feed or empty them."] },
    { id:"glowstone", name:"Glowstone", cat:"Blocks", legacy:"glowstone", num:"89", renew:true,
      tool:"None (Silk Touch to keep block)",
      obtain:"Mine glowstone blocks in the Nether, or craft 4 glowstone dust.",
      find:"Hangs from Nether ceilings, often over lava.",
      farm:"Witch farms drop glowstone dust, making the block renewable.",
      uses:"Full-bright light source, redstone lamps, and brewing (thick potions).",
      notes:["Drops 2-4 dust (Fortune up to 4) without Silk Touch.","Light level 15.","Can't be waterlogged; blocks piston-free light."] },
    { id:"sea_lantern", name:"Sea Lantern", cat:"Blocks", legacy:"sea_lantern", num:"169", renew:false,
      tool:"None (Silk Touch to keep block)",
      obtain:"Mine from ocean monuments, or craft from prismarine shards + crystals.",
      find:"Ocean monuments.",
      farm:null,
      uses:"Waterproof full-bright light source for underwater and modern builds.",
      notes:["Drops prismarine crystals without Silk Touch.","Light level 15.","Great for aquariums; won't fizzle underwater."] },
    { id:"hay_block", name:"Hay Bale", cat:"Blocks", img:"hay_block", legacy:"hay_block", num:"170", renew:true,
      tool:"None (hoe is fastest)",
      obtain:"Craft from 9 wheat.",
      find:"Villages, especially farms and animal pens.",
      farm:"Renewable through wheat farming.",
      uses:"Compact wheat storage, breeds/heals horses, and breaks fall damage by 80%.",
      notes:["Reverts to 9 wheat when crafted back.","Landing on it cuts fall damage.","Feeds horses and llamas fast."] },
    { id:"oak_leaves", name:"Oak Leaves", cat:"Blocks", kind:"block", img:"oak_leaves", legacy:"leaves", num:"18", renew:true,
      tool:"Shears or Silk Touch (to keep the block)",
      obtain:"Break leaves; shears/Silk Touch drop the block, otherwise you get saplings and sometimes apples/sticks.",
      find:"Oak and other trees across most biomes.",
      farm:"Renewable from a tree farm.",
      uses:"Decoration, hedges, and a renewable sapling/apple source.",
      notes:["Decays if no log is within 6 blocks (unless placed).","~5% sapling, ~0.5% apple drop.","Shears are the fast way to collect them."] },
    { id:"smooth_stone", name:"Smooth Stone", cat:"Blocks", kind:"block", legacy:null, num:null, renew:true,
      tool:"Wooden pickaxe or better",
      obtain:"Smelt regular stone in a furnace.",
      find:"Village smith and mason buildings.",
      farm:"Renewable via stone generators + smelting.",
      uses:"Smooth slabs, the blast furnace, and clean modern builds.",
      notes:["One step past cobblestone: cobble > stone > smooth stone.","Smooth slabs are a popular clean texture.","Needed to craft a blast furnace."] },
    { id:"deepslate", name:"Deepslate", cat:"Blocks", kind:"block", legacy:null, num:null, renew:false,
      tool:"Pickaxe (Silk Touch to keep it)",
      obtain:"Mine deepslate deep underground; without Silk Touch it drops cobbled deepslate.",
      find:"Everywhere below Y 0, down to bedrock.",
      farm:null,
      uses:"Deepslate bricks/tiles and a darker stone palette.",
      notes:["Tougher to mine than stone.","Drops cobbled deepslate unless Silk Touched.","Ores in it are the deepslate variants."] },
    { id:"beacon", name:"Beacon", cat:"Blocks", kind:"block", legacy:"beacon", num:"138", stack:1, renew:true,
      tool:"Pickaxe",
      obtain:"Craft from 1 nether star + 3 obsidian + 5 glass.",
      find:"Not naturally generated.",
      farm:"Renewable via wither (nether star) farms.",
      uses:"Projects a beam and grants area status effects when placed on a mineral pyramid.",
      notes:["Needs a 3x3 up to 9x9 pyramid of iron/gold/diamond/emerald/netherite.","Bigger pyramid = more effects and range.","Dye the glass to colour the beam."] },
    { id:"spawner", name:"Monster Spawner", cat:"Blocks", kind:"block", img:"spawner", legacy:"mob_spawner", num:"52", renew:false,
      tool:"Pickaxe",
      obtain:"Found in dungeons and structures; cannot be obtained, even with Silk Touch.",
      find:"Dungeons, mineshafts, strongholds, Nether fortresses and woodland mansions.",
      farm:"The basis of the best mob XP/drop farms in survival.",
      uses:"Spawns its mob type in a lit-up radius; light it to disable spawning.",
      notes:["You keep the spawner in place and farm around it.","Breaking it gives nothing.","Change spawn type only in Creative with a spawn egg."] },
    { id:"lodestone", name:"Lodestone", cat:"Blocks", kind:"block", legacy:null, num:null, renew:true,
      tool:"Pickaxe",
      obtain:"Craft from 8 chiseled stone bricks + 1 netherite ingot.",
      find:"Not naturally generated.",
      farm:"Renewable via netherite (slow).",
      uses:"Right-click with a compass to bind it, so the compass always points here.",
      notes:["Works across dimensions.","Compass spins if the lodestone is destroyed.","Great for marking bases and portals."] },
    { id:"blast_furnace", name:"Blast Furnace", cat:"Blocks", kind:"block", legacy:null, num:null, renew:true,
      tool:"Wooden pickaxe or better",
      obtain:"Craft from 5 iron ingots + 3 smooth stone + 1 furnace.",
      find:"Village armorer houses.",
      farm:"Renewable via iron farms.",
      uses:"Smelts ore, tools and armour twice as fast as a furnace; armorer job block.",
      notes:["Only smelts ore/metal items, not food.","Twice the speed, half the fuel time each.","Turns a villager into an armorer."] },
    { id:"composter", name:"Composter", cat:"Blocks", kind:"block", legacy:null, num:null, renew:true,
      tool:"None (axe is fastest)",
      obtain:"Craft from 7 wooden slabs.",
      find:"Village farms.",
      farm:"Turns surplus crops into renewable bone meal.",
      uses:"Fill with plant matter to produce bone meal; farmer job block.",
      notes:["Each item has a fill chance; 7 layers = 1 bone meal.","Great use for junk seeds and crops.","Hoppers can auto-feed and collect it."] },
    { id:"barrel", name:"Barrel", cat:"Blocks", kind:"block", legacy:null, num:null, renew:true,
      tool:"None (axe is fastest)",
      obtain:"Craft from 6 planks + 2 wooden slabs.",
      find:"Villages, especially fisher cottages.",
      farm:"Renewable via tree farms.",
      uses:"27-slot storage that opens even with a block on top; fisherman job block.",
      notes:["Same capacity as a chest.","Opens in tight spaces where chests can't.","Turns a villager into a fisherman."] },
    { id:"slime_block", name:"Slime Block", cat:"Blocks", kind:"block", img:"slime", legacy:"slime", num:"165", renew:true,
      tool:"None",
      obtain:"Craft from 9 slimeballs.",
      find:"Not naturally generated.",
      farm:"Renewable via slime farms.",
      uses:"Bouncy block; sticks to and moves other blocks in piston contraptions.",
      notes:["Cancels fall damage when landed on.","Moves attached blocks with pistons.","Honey blocks don't stick to slime, useful for machines."] },
    { id:"honey_block", name:"Honey Block", cat:"Blocks", kind:"block", legacy:null, num:null, renew:true,
      tool:"None",
      obtain:"Craft from 4 honey bottles.",
      find:"Not naturally generated.",
      farm:"Renewable via bee/beehive farms.",
      uses:"Slows and sticks entities; used in redstone machines and safe drops.",
      notes:["Slows walking and stops fall damage.","Sticks players/mobs on top and sides.","Doesn't stick to slime blocks."] },
    { id:"scaffolding", name:"Scaffolding", cat:"Blocks", kind:"block", legacy:null, num:null, renew:true,
      tool:"None",
      obtain:"Craft from 6 bamboo + 1 string (makes 6).",
      find:"Not naturally generated.",
      farm:"Renewable via a bamboo farm.",
      uses:"Fast temporary climbing/building; hold jump to rise, sneak to descend.",
      notes:["Extends sideways up to 6 blocks unsupported.","Break the bottom and the whole column drops.","Bamboo makes it cheap and renewable."] },
    { id:"conduit", name:"Conduit", cat:"Blocks", kind:"block", legacy:null, num:null, stack:1, renew:false,
      tool:"Pickaxe",
      obtain:"Craft from 1 heart of the sea + 8 nautilus shells.",
      find:"Not naturally generated.",
      farm:null,
      uses:"Underwater beacon: grants Conduit Power (breathing, night vision, mining) and attacks hostile mobs.",
      notes:["Activate by framing it in prismarine/sea lantern blocks.","Bigger frame = larger effect radius.","Damages drowned and guardians nearby."] },

    /* ===== Tools & combat ===== */
    { id:"diamond_sword", name:"Diamond Sword", cat:"Tools & Combat", legacy:"diamond_sword", num:"276", stack:1, renew:false,
      tool:"Crafting table",
      obtain:"Craft from 2 diamonds + 1 stick.",
      find:"Rarely in some loot chests.",
      farm:null,
      uses:"Strong melee weapon; enchant with Sharpness, Sweeping Edge and Looting.",
      notes:["7 attack damage before enchants.","1561 durability.","Upgrade to netherite for more damage and durability."] },
    { id:"diamond_pickaxe", name:"Diamond Pickaxe", cat:"Tools & Combat", legacy:"diamond_pickaxe", num:"278", stack:1, renew:false,
      tool:"Crafting table",
      obtain:"Craft from 3 diamonds + 2 sticks.",
      find:"Occasionally in loot chests.",
      farm:null,
      uses:"Mines everything including obsidian and ancient debris.",
      notes:["Required for obsidian and ancient debris.","Enchant with Efficiency, Fortune or Silk Touch.","1561 durability."] },
    { id:"bow", name:"Bow", cat:"Tools & Combat", legacy:"bow", num:"261", stack:1, renew:true,
      tool:"Crafting table",
      obtain:"Craft from 3 sticks + 3 string, loot chests, or skeleton drops.",
      find:"Skeletons sometimes drop a bow.",
      farm:"Skeleton/spider farms make string and bows renewable.",
      uses:"Ranged weapon; enchant with Power, Punch, Flame and Infinity.",
      notes:["Hold to charge for more damage.","Infinity needs just one arrow.","384 durability."] },
    { id:"arrow", name:"Arrow", cat:"Tools & Combat", legacy:"arrow", num:"262", renew:true,
      tool:"Crafting table",
      obtain:"Craft from flint + stick + feather, buy from villagers, or skeleton drops.",
      find:"Skeletons drop arrows; fletcher villagers sell them.",
      farm:"Skeleton farms give an endless supply.",
      uses:"Ammunition for bows and crossbows; tip with lingering potions.",
      notes:["1 craft makes 4 arrows.","Tipped arrows apply potion effects.","Infinity bows only need one."] },
    { id:"shield", name:"Shield", cat:"Tools & Combat", legacy:null, num:null, stack:1, renew:true,
      tool:"Crafting table",
      obtain:"Craft from 6 planks + 1 iron ingot.",
      find:"Rarely on illagers/pillagers.",
      farm:"Renewable via iron and tree farms.",
      uses:"Blocks most melee, arrows and explosions when raised.",
      notes:["Right-click / use to raise it.","Axes can disable it for 5 seconds.","Add a banner for custom designs."] },
    { id:"elytra", name:"Elytra", cat:"Tools & Combat", legacy:null, num:null, stack:1, renew:false,
      tool:"None",
      obtain:"Found only in end ship item frames in End cities.",
      find:"End ships floating near End cities.",
      farm:null,
      uses:"Wearable wings for gliding; boost with firework rockets.",
      notes:["Worn in the chestplate slot.","Repair with phantom membrane or mending.","Firework rockets give powered flight."] },
    { id:"trident", name:"Trident", cat:"Tools & Combat", legacy:null, num:null, stack:1, renew:true,
      tool:"None",
      obtain:"Dropped by drowned that spawn holding one (about 6.25% in Java).",
      find:"Drowned in oceans and rivers.",
      farm:"Drowned farms in river biomes make tridents renewable but slow.",
      uses:"Melee and thrown weapon; enchant with Riptide, Loyalty, Channeling or Impaling.",
      notes:["Loyalty returns it after throwing.","Riptide launches you in water or rain.","Channeling summons lightning during storms."] },
    { id:"fishing_rod", name:"Fishing Rod", cat:"Tools & Combat", legacy:"fishing_rod", num:"346", stack:1, renew:true,
      tool:"Crafting table",
      obtain:"Craft from 3 sticks + 2 string.",
      find:"Sometimes on witches and in loot chests.",
      farm:"String is renewable from spider/skeleton farms.",
      uses:"Fishing for food, junk and treasure; also pulls entities.",
      notes:["Lure speeds bites, Luck of the Sea improves loot.","65 durability (more per use casting).","Can reel in mobs and boats."] },
    { id:"flint_and_steel", name:"Flint and Steel", cat:"Tools & Combat", legacy:"flint_and_steel", num:"259", stack:1, renew:true,
      tool:"Crafting table",
      obtain:"Craft from 1 iron ingot + 1 flint.",
      find:"Nether-related loot and some chests.",
      farm:"Renewable via iron and gravel (flint) sources.",
      uses:"Lights Nether portals, TNT, campfires and fires.",
      notes:["Flint comes from digging gravel.","65 durability.","Essential for lighting your first Nether portal."] },
    { id:"shears", name:"Shears", cat:"Tools & Combat", legacy:"shears", num:"359", stack:1, renew:true,
      tool:"Crafting table",
      obtain:"Craft from 2 iron ingots.",
      find:"Occasionally on wandering traders' leads.",
      farm:"Renewable via iron farms.",
      uses:"Shear sheep for wool, harvest leaves, cobwebs, vines and more without breaking tools.",
      notes:["Sheep drop 1-3 wool when sheared.","Only tool that collects leaves and vines whole.","238 durability."] },
    { id:"bucket", name:"Bucket", cat:"Tools & Combat", legacy:"bucket", num:"325", stack:16, renew:true,
      tool:"Crafting table",
      obtain:"Craft from 3 iron ingots.",
      find:"Rarely in loot chests.",
      farm:"Renewable via iron farms.",
      uses:"Carry water, lava, milk, powder snow or aquatic mobs.",
      notes:["Water bucket negates fall damage (MLG).","Lava bucket is strong furnace fuel.","Milk clears status effects."] },

    /* ===== Food & farming ===== */
    { id:"wheat", name:"Wheat", cat:"Food & Farming", legacy:"wheat", num:"296", renew:true,
      tool:"None",
      obtain:"Harvest fully-grown wheat crops.",
      find:"Village farms; grows from seeds on farmland.",
      farm:"Till dirt near water, plant seeds, wait for it to turn golden, harvest, replant.",
      uses:"Bread, cake, cookies, hay bales; breeds cows, sheep and mooshrooms.",
      notes:["Bone meal instantly grows it.","Needs light level 9+ to grow.","Harvest gives 1 wheat + 0-3 seeds."] },
    { id:"wheat_seeds", name:"Wheat Seeds", cat:"Food & Farming", img:"wheat_seeds", legacy:"wheat_seeds", num:"295", renew:true,
      tool:"None",
      obtain:"Break tall grass, or harvest wheat crops.",
      find:"Tall grass across most biomes.",
      farm:"Self-sustaining: each harvest returns more seeds than you plant.",
      uses:"Plant for wheat; breed and tame chickens and parrots.",
      notes:["Chickens follow and breed with seeds.","Plant only on tilled farmland.","Also found by breaking grass blocks' plants."] },
    { id:"bread", name:"Bread", cat:"Food & Farming", legacy:"bread", num:"297", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 3 wheat in a row.",
      find:"Village and stronghold chests.",
      farm:"Renewable through wheat farming.",
      uses:"Reliable, no-cook food; also feeds/breeds villagers.",
      notes:["Restores 5 hunger.","No furnace needed.","Villagers pick it up and can breed."] },
    { id:"carrot", name:"Carrot", cat:"Food & Farming", legacy:"carrot", num:"391", renew:true,
      tool:"None",
      obtain:"Harvest carrot crops, kill zombies (rare drop), or loot villages.",
      find:"Village farms.",
      farm:"Plant carrots on farmland; each harvest yields multiple carrots.",
      uses:"Food, golden carrots, and breeding pigs/rabbits; carrot on a stick steers pigs.",
      notes:["Plant the carrot itself, not seeds.","Bone meal speeds growth.","Golden carrots are top-tier brewing ingredient."] },
    { id:"potato", name:"Potato", cat:"Food & Farming", legacy:"potato", num:"392", renew:true,
      tool:"None",
      obtain:"Harvest potato crops, kill zombies (rare), or loot villages.",
      find:"Village farms.",
      farm:"Plant potatoes on farmland; harvest yields multiple, plus rare poisonous ones.",
      uses:"Bake in a furnace for solid food; feed and breed pigs.",
      notes:["Baked potato restores 6 hunger.","Rarely drops a poisonous potato.","Plant the potato directly."] },
    { id:"sugar_cane", name:"Sugar Cane", cat:"Food & Farming", img:"sugar_cane", legacy:"reeds", num:"338", renew:true,
      tool:"None",
      obtain:"Break naturally growing sugar cane. Grows on grass/dirt/sand next to water.",
      find:"Riverbanks, beaches, swamps and desert oases beside water.",
      farm:"Plant on sand or dirt next to water; it grows up to 3 tall. Harvest the top two blocks and it regrows.",
      uses:"Paper (books, maps, fireworks) and sugar (cake, fermented spider eye).",
      notes:["Must be adjacent to water to grow.","Legacy id is 'reeds'.","Observer-based auto-farms are popular."] },
    { id:"sugar", name:"Sugar", cat:"Food & Farming", legacy:"sugar", num:"353", renew:true,
      tool:"None",
      obtain:"Craft from 1 sugar cane; also from honey bottles.",
      find:"Not found naturally.",
      farm:"Renewable through sugar cane farming.",
      uses:"Cake, pumpkin pie, fermented spider eye, and Swiftness potions.",
      notes:["1 sugar cane = 1 sugar.","Speeds up brewing recipes.","Feeds/breeds horses in some versions."] },
    { id:"paper", name:"Paper", cat:"Food & Farming", legacy:"paper", num:"339", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 3 sugar cane in a row.",
      find:"Some loot chests.",
      farm:"Renewable through sugar cane farming.",
      uses:"Books, maps, banners patterns and firework rockets.",
      notes:["3 cane = 3 paper.","3 paper = 1 map.","Cartography and librarian trades use it."] },
    { id:"apple", name:"Apple", cat:"Food & Farming", legacy:"apple", num:"260", renew:true,
      tool:"None (axe helps)",
      obtain:"Break oak or dark oak leaves (small chance), or loot chests.",
      find:"Oak and dark oak forests.",
      farm:"A dark-oak tree farm gives a steady apple supply.",
      uses:"Food, plus the key ingredient in golden apples.",
      notes:["~0.5% drop from oak leaves.","Restores 4 hunger.","Enchanted apples need 8 gold blocks."] },
    { id:"golden_apple", name:"Golden Apple", cat:"Food & Farming", legacy:"golden_apple", num:"322", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 1 apple + 8 gold ingots. Also found in loot chests.",
      find:"Dungeon, temple and ruined portal chests.",
      farm:"Renewable via apple and gold farms.",
      uses:"Strong healing food; cures/weakens zombie villagers with a potion.",
      notes:["Grants Absorption and Regeneration.","Eatable even at full hunger.","Cures zombie villagers (with Weakness)."] },
    { id:"enchanted_golden_apple", name:"Enchanted Golden Apple", cat:"Food & Farming", img:"enchanted_golden_apple", legacy:"golden_apple", num:"322:1", renew:false,
      tool:"None",
      obtain:"Loot only: dungeons, mineshafts, temples, ruined portals and bastions.",
      find:"Bastion and temple loot chests.",
      farm:null,
      uses:"Best emergency food/buff item in the game.",
      notes:["No longer craftable (the 'notch apple').","Gives Regen II, Absorption IV, Resistance and Fire Resistance.","Very rare loot."] },
    { id:"cooked_beef", name:"Steak", cat:"Food & Farming", img:"cooked_beef", legacy:"cooked_beef", num:"364", renew:true,
      tool:"None",
      obtain:"Cook raw beef in a furnace/campfire, or kill cows near fire.",
      find:"Cows in most grassy biomes.",
      farm:"Cow farms with a campfire floor auto-cook the beef.",
      uses:"One of the best hunger foods in the game.",
      notes:["Restores 8 hunger and high saturation.","Breed cows with wheat.","Smoker cooks it twice as fast."] },
    { id:"golden_carrot", name:"Golden Carrot", cat:"Food & Farming", legacy:"golden_carrot", num:"396", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 1 carrot + 8 gold nuggets.",
      find:"Rarely in some loot chests.",
      farm:"Renewable via carrot and gold farms.",
      uses:"Best saturation food; brews Night Vision potions.",
      notes:["Highest saturation of any food.","Great for staying full on long trips.","Key brewing ingredient."] },
    { id:"cake", name:"Cake", cat:"Food & Farming", legacy:"cake", num:"354", stack:1, renew:true,
      tool:"Crafting table",
      obtain:"Craft from 3 milk + 2 sugar + 1 egg + 3 wheat.",
      find:"Some woodland mansion rooms.",
      farm:"Renewable via cow, chicken and wheat farms.",
      uses:"Placeable food block eaten in 7 slices; villagers/parrots interact with it.",
      notes:["Must be placed to eat; can't stack.","Each slice restores 2 hunger.","Buckets of milk are not consumed... but the cake uses whole buckets."] },
    { id:"cocoa_beans", name:"Cocoa Beans", cat:"Food & Farming", img:"cocoa_beans", legacy:"dye", num:"351:3", renew:true,
      tool:"None (axe helps)",
      obtain:"Harvest cocoa pods growing on jungle logs.",
      find:"Jungle biomes, on the sides of jungle trees.",
      farm:"Plant beans on jungle logs; they ripen from green to orange, then harvest.",
      uses:"Cookies and brown dye.",
      notes:["Only fully-grown (orange) pods drop multiple beans.","Brown dye source.","Cookies need 2 wheat + 1 cocoa for 8."] },
    { id:"nether_wart", name:"Nether Wart", cat:"Food & Farming", img:"nether_wart", legacy:"nether_wart", num:"372", renew:true,
      tool:"None",
      obtain:"Harvest nether wart growing near Nether fortresses.",
      find:"Soul sand gardens inside Nether fortresses and bastions.",
      farm:"Plant on soul sand anywhere (even the Overworld); no light or water needed.",
      uses:"The base for almost every potion (Awkward Potion).",
      notes:["Grows only on soul sand.","No water or light requirement.","Bone meal does NOT speed it up."] },
    { id:"melon_slice", name:"Melon Slice", cat:"Food & Farming", img:"melon_slice", legacy:"melon", num:"360", renew:true,
      tool:"None (axe helps)",
      obtain:"Break a melon block (drops 3-7 slices).",
      find:"Jungle and savanna villages; wild melons in jungles.",
      farm:"Plant melon seeds; stems grow a melon block on adjacent farmland/dirt.",
      uses:"Quick food and glistering melon for Healing potions.",
      notes:["Craft 9 slices back into a melon block.","Stems produce endlessly without replanting.","Glistering melon = 8 gold nuggets + 1 slice."] },

    /* ===== Redstone ===== */
    { id:"torch", name:"Torch", cat:"Redstone", legacy:"torch", num:"50", renew:true,
      tool:"None",
      obtain:"Craft from 1 coal/charcoal + 1 stick.",
      find:"Mineshafts, villages and strongholds.",
      farm:"Renewable via charcoal from a tree farm.",
      uses:"Light level 14 to stop mob spawns; melts snow and ice nearby.",
      notes:["1 coal + 1 stick = 4 torches.","Placed on floors and walls.","Won't survive underwater."] },
    { id:"redstone_torch", name:"Redstone Torch", cat:"Redstone", legacy:"redstone_torch", num:"76", renew:true,
      tool:"None",
      obtain:"Craft from 1 redstone dust + 1 stick.",
      find:"Not typically found placed.",
      farm:"Renewable via redstone (witch farms) and sticks.",
      uses:"Constant power source; the basis of redstone NOT gates and clocks.",
      notes:["Powers adjacent blocks and wire.","Inverts its input signal.","Burns out if toggled too fast."] },
    { id:"piston", name:"Piston", cat:"Redstone", legacy:"piston", num:"33", renew:true,
      tool:"None (pickaxe/axe help)",
      obtain:"Craft from 3 planks + 4 cobblestone + 1 iron ingot + 1 redstone.",
      find:"Not naturally generated.",
      farm:"Renewable via iron and redstone farms.",
      uses:"Pushes blocks; the core of most redstone machines and doors.",
      notes:["Pushes up to 12 blocks.","Can't pull (use a sticky piston).","Obsidian and bedrock can't be pushed."] },
    { id:"sticky_piston", name:"Sticky Piston", cat:"Redstone", legacy:"sticky_piston", num:"29", renew:true,
      tool:"None (pickaxe/axe help)",
      obtain:"Craft from 1 piston + 1 slimeball, or 1 piston + 1 honey block.",
      find:"Not naturally generated.",
      farm:"Renewable via slime farms.",
      uses:"Pushes and pulls a block; used in flying machines and hidden doors.",
      notes:["Pulls the attached block back.","Slime and honey pistons don't stick to each other.","Fast retraction can drop the block."] },
    { id:"observer", name:"Observer", cat:"Redstone", legacy:"observer", num:"218", renew:true,
      tool:"Pickaxe",
      obtain:"Craft from 6 cobblestone + 2 redstone + 1 nether quartz.",
      find:"Not naturally generated.",
      farm:"Renewable via cobblestone, redstone and quartz sources.",
      uses:"Emits a pulse when the block it faces changes; drives auto-farms.",
      notes:["Detects block updates in front of its face.","The little dot marks the output side.","Great for crop and flying-machine farms."] },
    { id:"hopper", name:"Hopper", cat:"Redstone", legacy:"hopper", num:"154", renew:true,
      tool:"Wooden pickaxe or better",
      obtain:"Craft from 5 iron ingots + 1 chest.",
      find:"Not naturally generated.",
      farm:"Renewable via iron farms.",
      uses:"Moves items between containers; the backbone of sorting systems.",
      notes:["Point it into a container to feed it.","Powering a hopper stops it.","Collects items that fall onto it."] },
    { id:"redstone_lamp", name:"Redstone Lamp", cat:"Redstone", legacy:"redstone_lamp", num:"123", renew:true,
      tool:"None (pickaxe helps)",
      obtain:"Craft from 4 redstone + 1 glowstone.",
      find:"Not naturally generated.",
      farm:"Renewable via witch (glowstone/redstone) farms.",
      uses:"Toggleable light level 15 for redstone lighting.",
      notes:["Lights up when powered.","Can be waterlogged? No, but works underwater when lit.","Great for day/night lamp circuits."] },
    { id:"note_block", name:"Note Block", cat:"Redstone", img:"note_block", legacy:"noteblock", num:"25", renew:true,
      tool:"None (axe is fastest)",
      obtain:"Craft from 8 planks + 1 redstone.",
      find:"Not naturally generated.",
      farm:"Renewable via tree and redstone farms.",
      uses:"Plays sounds for music and redstone note machines.",
      notes:["The block underneath changes the instrument.","Right-click to change pitch (25 notes).","Must have air above to sound."] },

    /* ===== Mob drops & brewing ===== */
    { id:"string", name:"String", cat:"Mob Drops", legacy:"string", num:"287", renew:true,
      tool:"None (sword/shears help)",
      obtain:"Kill spiders, break cobwebs, fish it up, or trade.",
      find:"Spiders everywhere; cobwebs in mineshafts and strongholds.",
      farm:"Spider spawner farms give endless string.",
      uses:"Bows, fishing rods, leads, wool, scaffolding and tripwire.",
      notes:["4 string = 1 wool.","Shears/swords break cobwebs into string.","Cave spiders drop it too."] },
    { id:"gunpowder", name:"Gunpowder", cat:"Mob Drops", legacy:"gunpowder", num:"289", renew:true,
      tool:"None",
      obtain:"Kill creepers, ghasts and witches; loot chests; buy from wandering traders.",
      find:"Creepers spawn in the dark across the Overworld.",
      farm:"Creeper farms (charged by cats/lightning setups) yield lots of gunpowder.",
      uses:"TNT, fire charges, firework rockets and splash potions.",
      notes:["Creepers drop 0-2 (more with Looting).","Firework flight time uses gunpowder.","Ghasts and witches also drop it."] },
    { id:"bone", name:"Bone", cat:"Mob Drops", legacy:"bone", num:"352", renew:true,
      tool:"None",
      obtain:"Kill skeletons and other undead; fish; loot chests.",
      find:"Skeletons in the dark and in the Nether (wither skeletons).",
      farm:"Skeleton spawner farms drop stacks of bones.",
      uses:"Bone meal (fertiliser), and taming/healing wolves.",
      notes:["1 bone = 3 bone meal.","Tames wolves.","Fish sometimes bite bones."] },
    { id:"bone_meal", name:"Bone Meal", cat:"Mob Drops", img:"bone_meal", legacy:"dye", num:"351:15", renew:true,
      tool:"None",
      obtain:"Craft from 1 bone (makes 3), or from a bone block (makes 9); composters produce it.",
      find:"Not found directly; produced from bones or a composter.",
      farm:"A composter fed with excess crops turns them into renewable bone meal.",
      uses:"Instantly grows most crops and plants; white dye.",
      notes:["Grows wheat, saplings, flowers and more.","Does not speed up nether wart or cocoa fully.","Composters convert crops to bone meal."] },
    { id:"ender_pearl", name:"Ender Pearl", cat:"Mob Drops", legacy:"ender_pearl", num:"368", renew:true,
      tool:"None",
      obtain:"Kill endermen, trade with clerics, or loot chests.",
      find:"Endermen in the End, Nether and dark Overworld.",
      farm:"Enderman farms in the End (or warped forest) give stacks of pearls.",
      uses:"Teleport by throwing; craft eyes of ender to find strongholds.",
      notes:["Throwing teleports you (with fall damage).","1 pearl + blaze powder = eye of ender.","Endermen drop 0-1 (more with Looting)."] },
    { id:"ender_eye", name:"Eye of Ender", cat:"Mob Drops", img:"ender_eye", legacy:"ender_eye", num:"381", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 1 ender pearl + 1 blaze powder.",
      find:"Not found; always crafted.",
      farm:"Renewable via enderman and blaze farms.",
      uses:"Locates and activates the End portal; opens ender chests-adjacent... (End portals).",
      notes:["Throw it to point toward the nearest stronghold.","Has a chance to shatter when thrown.","12 fill an End portal frame."] },
    { id:"blaze_rod", name:"Blaze Rod", cat:"Mob Drops", legacy:"blaze_rod", num:"369", renew:true,
      tool:"None",
      obtain:"Kill blazes in Nether fortresses.",
      find:"Blaze spawners in Nether fortresses.",
      farm:"A blaze-spawner farm gives a steady supply of rods.",
      uses:"Blaze powder (eyes of ender, brewing fuel) and brewing stands.",
      notes:["1 rod = 2 blaze powder.","Blaze powder fuels the brewing stand.","Only blazes drop them."] },
    { id:"slime_ball", name:"Slimeball", cat:"Mob Drops", img:"slime_ball", legacy:"slime_ball", num:"341", renew:true,
      tool:"None",
      obtain:"Kill slimes; baby slimes always drop one. Also from sneezing baby pandas.",
      find:"Slime chunks deep underground and swamp biomes at night.",
      farm:"Slime-chunk or swamp farms give reliable slimeballs.",
      uses:"Sticky pistons, slime blocks, leads and magma cream.",
      notes:["Slime blocks bounce and stick.","Sticky piston needs 1 slimeball.","Leads need slimeball + string."] },
    { id:"leather", name:"Leather", cat:"Mob Drops", legacy:"leather", num:"334", renew:true,
      tool:"None",
      obtain:"Kill cows, horses and llamas; fish; or from rotten flesh in a smoker? (no), trade with leatherworkers.",
      find:"Cows in most grassy biomes.",
      farm:"Cow farms provide leather and beef together.",
      uses:"Books, leather armour, item frames and horse armour.",
      notes:["Cows drop 0-2 (more with Looting).","Books need 1 leather + 3 paper.","Leather armour is dyeable."] },
    { id:"feather", name:"Feather", cat:"Mob Drops", legacy:"feather", num:"288", renew:true,
      tool:"None",
      obtain:"Kill chickens; also from breaking down some drops.",
      find:"Chickens across grassy biomes.",
      farm:"Automatic chicken farms drop feathers and eggs endlessly.",
      uses:"Arrows and some decorative recipes.",
      notes:["Chickens drop 0-2 feathers.","3 feathers per arrow craft.","Egg-based chicken farms are fully automatic."] },
    { id:"spider_eye", name:"Spider Eye", cat:"Brewing", legacy:"spider_eye", num:"375", renew:true,
      tool:"None",
      obtain:"Kill spiders and cave spiders; from witches.",
      find:"Spiders at night and in mineshafts (cave spiders).",
      farm:"Spider farms drop spider eyes alongside string.",
      uses:"Fermented spider eye (for negative potions) and Poison potions.",
      notes:["Eating it poisons you.","Fermented spider eye flips potion effects.","Looting increases drops."] },
    { id:"blaze_powder", name:"Blaze Powder", cat:"Brewing", legacy:"blaze_powder", num:"377", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 1 blaze rod (makes 2).",
      find:"Not found; crafted from blaze rods.",
      farm:"Renewable via blaze farms.",
      uses:"Fuels the brewing stand, makes eyes of ender, magma cream and Strength potions.",
      notes:["1 powder brews up to 20 items? (fuels 20 operations).","Needed for eyes of ender.","Strength potion base ingredient."] },
    { id:"ghast_tear", name:"Ghast Tear", cat:"Brewing", legacy:"ghast_tear", num:"370", renew:true,
      tool:"None",
      obtain:"Kill ghasts in the Nether (tricky, they fly).",
      find:"Ghasts in the Nether wastes and soul sand valleys.",
      farm:"Dedicated ghast farms exist but are advanced.",
      uses:"Regeneration potions and end crystals.",
      notes:["Ghasts drop 0-1 tear.","Shoot back their fireballs to kill them.","End crystals need a ghast tear."] },
    { id:"nether_star", name:"Nether Star", cat:"Mob Drops", legacy:"nether_star", num:"399", stack:1, renew:true,
      tool:"None",
      obtain:"Kill the Wither boss (build it from 4 soul sand + 3 wither skeleton skulls).",
      find:"Dropped only by the Wither.",
      farm:"Wither cages/farms let you kill withers repeatedly.",
      uses:"Crafts beacons.",
      notes:["Always drops exactly one.","Immune to despawning and explosions.","Beacon = 1 star + 3 obsidian + 5 glass."] },
    { id:"totem_of_undying", name:"Totem of Undying", cat:"Mob Drops", legacy:"totem_of_undying", num:"449", stack:1, renew:true,
      tool:"None",
      obtain:"Kill an evoker (found in woodland mansions and raids).",
      find:"Evokers in woodland mansions and pillager raids.",
      farm:"Raid farms produce totems in bulk.",
      uses:"Cheats death once: hold it and survive lethal damage.",
      notes:["Must be in your hand or off-hand.","Restores 1 health + gives buffs on use.","Consumed when it saves you."] },

    /* ===== Misc & utility ===== */
    { id:"book", name:"Book", cat:"Misc & Utility", legacy:"book", num:"340", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 3 paper + 1 leather.",
      find:"Stronghold libraries and other loot.",
      farm:"Renewable via sugar cane and cow farms.",
      uses:"Bookshelves, enchanted books, and book & quill.",
      notes:["3 books + 6 planks = bookshelf.","Combine with an anvil to store enchants.","Cartography and lecterns use books."] },
    { id:"enchanted_book", name:"Enchanted Book", cat:"Misc & Utility", legacy:"enchanted_book", num:"403", stack:1, renew:true,
      tool:"Enchanting table / anvil",
      obtain:"Enchant a book, fish, loot chests, or trade with librarians.",
      find:"Librarian trades are the reliable source.",
      farm:"Librarian villager trading gives targeted enchanted books.",
      uses:"Apply one enchantment to gear via an anvil.",
      notes:["Lets you pick exactly which enchant to apply.","Mending and Silk Touch are trade-only or book-only.","Combine two books in an anvil to upgrade."] },
    { id:"name_tag", name:"Name Tag", cat:"Misc & Utility", legacy:"name_tag", num:"421", renew:true,
      tool:"Anvil (to rename)",
      obtain:"Fish it up, loot chests, or buy from wandering traders/librarians.",
      find:"Dungeon and mineshaft chests; fishing treasure.",
      farm:"Librarian/wandering trader trades make it renewable.",
      uses:"Name a mob so it never despawns; some names trigger easter eggs.",
      notes:["Rename it on an anvil first.","Named mobs won't despawn.","'Dinnerbone' flips a mob upside down."] },
    { id:"lead", name:"Lead", cat:"Misc & Utility", legacy:"lead", num:"420", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 4 string + 1 slimeball; also on wandering trader llamas.",
      find:"Wandering traders arrive leashing llamas.",
      farm:"Renewable via string and slime farms.",
      uses:"Leash and lead most passive mobs; tie them to fence posts.",
      notes:["1 craft makes 2 leads.","Attach to a fence to tether a mob.","Breaks if stretched too far."] },
    { id:"saddle", name:"Saddle", cat:"Misc & Utility", legacy:"saddle", num:"329", stack:1, renew:true,
      tool:"None",
      obtain:"Fish it up, loot chests, buy from leatherworkers, or find on some mobs.",
      find:"Dungeon, temple and Nether fortress chests; fishing treasure.",
      farm:"Leatherworker villager trades make saddles renewable.",
      uses:"Ride horses, mules, donkeys, pigs (with carrot on a stick) and striders.",
      notes:["Cannot be crafted.","Needed to control ridden mobs.","Striders need a warped-fungus-on-a-stick, not just a saddle."] },
    { id:"clock", name:"Clock", cat:"Misc & Utility", legacy:"clock", num:"347", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 4 gold ingots + 1 redstone.",
      find:"Some loot chests.",
      farm:"Renewable via gold and redstone farms.",
      uses:"Shows the in-game time of day; handy underground.",
      notes:["Shows sun/moon position.","Useless in the Nether/End (spins).","Great for timed builds."] },
    { id:"compass", name:"Compass", cat:"Misc & Utility", legacy:"compass", num:"345", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 4 iron ingots + 1 redstone.",
      find:"Some loot chests; cartographer trades.",
      farm:"Renewable via iron and redstone farms.",
      uses:"Points to your world spawn; combine with a map to track your position.",
      notes:["Always points to spawn (or a lodestone).","Lodestone compasses point to that block.","Spins in the Nether/End."] },
    { id:"spyglass", name:"Spyglass", cat:"Misc & Utility", legacy:null, num:null, stack:1, renew:true,
      tool:"Crafting table",
      obtain:"Craft from 2 copper ingots + 1 amethyst shard.",
      find:"Not found; always crafted.",
      farm:"Renewable via copper (drowned) and amethyst.",
      uses:"Zoom in to scout distant terrain and mobs.",
      notes:["Use it to zoom; narrows your view.","Added after 1.13, no legacy id.","Great for exploring and building sightlines."] },
    { id:"experience_bottle", name:"Bottle o' Enchanting", cat:"Misc & Utility", img:"experience_bottle", legacy:"experience_bottle", num:"384", renew:true,
      tool:"None",
      obtain:"Trade with clerics and some other villagers; loot.",
      find:"Cleric villager trades.",
      farm:"Villager trading makes XP bottles renewable.",
      uses:"Throw to release experience orbs on demand.",
      notes:["Each bottle gives 3-11 XP.","Great for storing XP as items.","Can enchant/repair without a farm."] },
    { id:"firework_rocket", name:"Firework Rocket", cat:"Misc & Utility", img:"firework_rocket", legacy:"fireworks", num:"401", renew:true,
      tool:"Crafting table",
      obtain:"Craft from 1 paper + 1-3 gunpowder (+ optional firework stars).",
      find:"Some structures rarely.",
      farm:"Renewable via gunpowder and paper.",
      uses:"Elytra boosting, crossbow ammo, and firework shows.",
      notes:["More gunpowder = longer flight/higher.","Crossbow-fired rockets deal explosion damage.","Stars add colours and shapes."] },
    { id:"egg", name:"Egg", cat:"Misc & Utility", legacy:"egg", num:"344", stack:16, renew:true,
      tool:"None",
      obtain:"Chickens lay an egg every 5-10 minutes.",
      find:"Anywhere chickens roam.",
      farm:"A chicken coop with hoppers auto-collects eggs.",
      uses:"Cake and pumpkin pie; throw to (rarely) spawn baby chickens.",
      notes:["Throwing has a small chance to spawn a chick.","Stacks to 16.","Cake needs one egg."] },

    /* ===== Mobs & entities ===== */
    { id:"zombie", name:"Zombie", cat:"Mobs & Entities", kind:"entity", legacy:"Zombie", num:"54",
      health:"20 (10 hearts)", behavior:"Hostile",
      obtain:"Spawns in the dark (light level 0). Burns in daylight.",
      find:"Overworld, in caves and at night everywhere.",
      farm:"Zombie spawners and dark-room farms give rotten flesh and XP.",
      uses:"Drops rotten flesh, plus rare iron, carrots or potatoes with Looting.",
      notes:["Burns in sunlight unless in water/shade.","Can pick up and wear armour.","Baby and drowned variants exist."] },
    { id:"creeper", name:"Creeper", cat:"Mobs & Entities", kind:"entity", legacy:"Creeper", num:"50",
      health:"20 (10 hearts)", behavior:"Hostile",
      obtain:"Spawns in the dark; silently approaches and explodes.",
      find:"Overworld surface and caves at night.",
      farm:"Creeper-only farms (cats scare them; charged by lightning) yield gunpowder.",
      uses:"Drops gunpowder; drops a music disc if killed by a skeleton's arrow.",
      notes:["Explodes ~1.5s after reaching you.","Afraid of cats and ocelots.","Lightning makes a Charged Creeper with a bigger blast."] },
    { id:"skeleton", name:"Skeleton", cat:"Mobs & Entities", kind:"entity", legacy:"Skeleton", num:"51",
      health:"20 (10 hearts)", behavior:"Hostile",
      obtain:"Spawns in the dark; shoots arrows from range. Burns in daylight.",
      find:"Overworld caves and surface at night.",
      farm:"Skeleton spawner farms give bones, arrows and XP.",
      uses:"Drops bones and arrows; sometimes a bow or armour.",
      notes:["Burns in sunlight.","Its arrows can trigger other mob drops.","Bones make bone meal for farming."] },
    { id:"spider", name:"Spider", cat:"Mobs & Entities", kind:"entity", legacy:"Spider", num:"52",
      health:"16 (8 hearts)", behavior:"Neutral (hostile in the dark)",
      obtain:"Spawns in the dark; climbs walls and is 2 blocks wide.",
      find:"Overworld surface and caves; cave spiders in mineshafts.",
      farm:"Spider farms drop string and spider eyes.",
      uses:"Drops string; sometimes a spider eye.",
      notes:["Neutral in bright light, hostile in the dark.","Climbs walls and fits through 1-tall gaps.","Can spawn with potion effects (spider jockeys)."] },
    { id:"enderman", name:"Enderman", cat:"Mobs & Entities", kind:"entity", legacy:"Enderman", num:"58",
      health:"40 (20 hearts)", behavior:"Neutral",
      obtain:"Spawns in the dark in groups; teleports and picks up blocks.",
      find:"Overworld at night, the Nether (warped forest), and densely in the End.",
      farm:"End enderman farms are the top XP/ender-pearl farms.",
      uses:"Drops ender pearls used for teleporting and eyes of ender.",
      notes:["Hostile if you look at its head or hit it.","Teleports away from water and rain.","Take damage from water and touching it."] },
    { id:"blaze", name:"Blaze", cat:"Mobs & Entities", kind:"entity", legacy:"Blaze", num:"61",
      health:"20 (10 hearts)", behavior:"Hostile",
      obtain:"Spawns from blaze spawners in Nether fortresses.",
      find:"Nether fortresses only.",
      farm:"Blaze-spawner farms give rods and huge XP.",
      uses:"Drops blaze rods for brewing and eyes of ender.",
      notes:["Flies and shoots fireballs in bursts.","Snowballs deal extra damage to it.","Blaze rods are essential for potions and the End."] },
    { id:"ghast", name:"Ghast", cat:"Mobs & Entities", kind:"entity", legacy:"Ghast", num:"56",
      health:"10 (5 hearts)", behavior:"Hostile",
      obtain:"Spawns in large open Nether areas.",
      find:"Nether wastes and soul sand valleys.",
      farm:"Advanced ghast farms exist for tears.",
      uses:"Drops ghast tears (regen potions, end crystals) and gunpowder.",
      notes:["Deflect its fireballs back to kill it.","Fireballs can break Nether terrain.","Huge (4x4x4) but low health."] },
    { id:"witch", name:"Witch", cat:"Mobs & Entities", kind:"entity", legacy:"Witch", num:"66",
      health:"26 (13 hearts)", behavior:"Hostile",
      obtain:"Spawns in the dark, in swamp huts, and during raids.",
      find:"Swamp huts, dark areas, and pillager raids.",
      farm:"Witch farms (swamp hut based) drop redstone, glowstone, sugar and more.",
      uses:"Drops redstone, glowstone dust, sugar, sticks, bottles and gunpowder.",
      notes:["Throws harmful splash potions.","Drinks potions to resist damage.","One of the best sources of mixed redstone loot."] },
    { id:"zombified_piglin", name:"Zombified Piglin", cat:"Mobs & Entities", kind:"entity", legacy:"PigZombie", num:"57",
      health:"20 (10 hearts)", behavior:"Neutral",
      obtain:"Spawns in the Nether, or when a piglin enters the Overworld/End.",
      find:"Nether wastes and crimson forests; near Nether portals.",
      farm:"Overworld portal farms give gold nuggets and XP.",
      uses:"Drops rotten flesh and gold nuggets; rarely a gold ingot or sword.",
      notes:["Provoking one angers the whole group.","Formerly 'Zombie Pigman'.","A renewable gold source via portal farms."] },
    { id:"piglin", name:"Piglin", cat:"Mobs & Entities", kind:"entity", legacy:null, num:null,
      health:"16 (8 hearts)", behavior:"Neutral (hostile if you have no gold armour)",
      obtain:"Spawns in the Nether; will barter dropped gold ingots for items.",
      find:"Nether wastes, crimson forests and bastion remnants.",
      farm:"Gold-farm bartering halls give tons of loot for gold ingots.",
      uses:"Barter gold ingots for ender pearls, obsidian, quartz, string and more.",
      notes:["Wear at least one gold item so they stay calm.","They hate you opening chests or mining gold.","Bartering is the main renewable ender-pearl source."] },
    { id:"cow", name:"Cow", cat:"Mobs & Entities", kind:"entity", legacy:"Cow", num:"92",
      health:"10 (5 hearts)", behavior:"Passive",
      obtain:"Spawns on grass in most Overworld biomes.",
      find:"Plains, forests and other grassy biomes.",
      farm:"Breed with wheat; a cow farm gives beef and leather.",
      uses:"Drops beef and leather; milk it with a bucket to clear status effects.",
      notes:["Breed two cows with wheat for a calf.","Milk cures poison and other effects.","Leather is needed for books."] },
    { id:"pig", name:"Pig", cat:"Mobs & Entities", kind:"entity", legacy:"Pig", num:"90",
      health:"10 (5 hearts)", behavior:"Passive",
      obtain:"Spawns on grass in most Overworld biomes.",
      find:"Plains and forests.",
      farm:"Breed with carrots, potatoes or beetroot for porkchops.",
      uses:"Drops porkchops; rideable with a saddle and a carrot on a stick.",
      notes:["Steer a saddled pig with a carrot on a stick.","Lightning turns a pig into a zombified piglin.","Breed with root vegetables, not wheat."] },
    { id:"chicken", name:"Chicken", cat:"Mobs & Entities", kind:"entity", legacy:"Chicken", num:"93",
      health:"4 (2 hearts)", behavior:"Passive",
      obtain:"Spawns in grassy biomes; also hatches from thrown eggs.",
      find:"Plains and forests.",
      farm:"Egg-based auto farms produce endless meat and feathers.",
      uses:"Drops raw chicken and feathers; lays eggs every 5-10 minutes.",
      notes:["Takes no fall damage (flaps to slow down).","Throwing eggs can spawn chicks.","Feathers are needed for arrows."] },
    { id:"sheep", name:"Sheep", cat:"Mobs & Entities", kind:"entity", legacy:"Sheep", num:"91",
      health:"8 (4 hearts)", behavior:"Passive",
      obtain:"Spawns in grassy biomes in various wool colours.",
      find:"Plains, forests and meadows.",
      farm:"Shear-and-regrow wool farms are fully renewable.",
      uses:"Shear for wool (1-3) or drop wool and mutton when killed.",
      notes:["Regrows wool after eating grass.","Dye a sheep to change its wool colour.","Shearing is better than killing for wool."] },
    { id:"villager", name:"Villager", cat:"Mobs & Entities", kind:"entity", legacy:"Villager", num:"120",
      health:"20 (10 hearts)", behavior:"Passive",
      obtain:"Spawns in villages; breeds when well-fed with enough beds.",
      find:"Villages across many biomes.",
      farm:"Trading halls turn villagers into renewable emeralds and gear.",
      uses:"Trade emeralds for tools, armour, enchanted books, food and more.",
      notes:["Job block sets their profession and trades.","Restock by letting them work twice a day.","Cure a zombie villager for big trade discounts."] },
    { id:"wolf", name:"Wolf", cat:"Mobs & Entities", kind:"entity", legacy:"Wolf", num:"95",
      health:"8 wild / 20 tamed", behavior:"Neutral (tameable)",
      obtain:"Spawns in forests and taiga; tame with bones.",
      find:"Forest, taiga and grove biomes.",
      farm:"Breed tamed wolves with meat.",
      uses:"Tamed wolves fight for you and can be bred; drop nothing useful wild.",
      notes:["Tame by feeding bones until hearts appear.","Tail height shows a tamed wolf's health.","Sits and stays on command; heal with meat."] },
    { id:"axolotl", name:"Axolotl", cat:"Mobs & Entities", kind:"entity", legacy:null, num:null,
      health:"14 (7 hearts)", behavior:"Passive (hostile to aquatic mobs)",
      obtain:"Spawns underground in water below Y 0, near dripstone.",
      find:"Lush caves and underground water bodies.",
      farm:"Bucket and breed them with buckets of tropical fish.",
      uses:"A cute ally that attacks guardians and drowned; gives you Regeneration when it wins.",
      notes:["Play dead to regenerate when hurt.","Scoop into a bucket to carry safely.","The rare blue variant only comes from breeding."] },
    { id:"ender_dragon", name:"Ender Dragon", cat:"Mobs & Entities", kind:"entity", img:"dragon_head",
      legacy:"EnderDragon", num:"63", egg:false,
      health:"200 (100 hearts)", behavior:"Boss",
      obtain:"Already present in the End; re-summon with 4 end crystals on the portal.",
      find:"The central island of the End dimension.",
      farm:"Re-fight it with end crystals for XP and dragon's breath.",
      uses:"First kill drops huge XP and unlocks the End; drops the dragon egg once.",
      notes:["Destroy the end crystals on the pillars first.","Immune to arrows while healing at a crystal.","Re-summons drop no egg, but give dragon's breath."] },
    { id:"wither", name:"Wither", cat:"Mobs & Entities", kind:"entity", img:"nether_star",
      legacy:"WitherBoss", num:"64", egg:false,
      health:"300 (150 hearts)", behavior:"Boss",
      obtain:"Build it from 4 soul sand + 3 wither skeleton skulls in a T shape.",
      find:"Spawned by the player anywhere.",
      farm:"Wither cages let you kill it repeatedly for nether stars.",
      uses:"Drops a nether star for crafting beacons.",
      notes:["Explodes on spawn, so fight it carefully.","Breaks most blocks except bedrock.","Skulls come from wither skeletons in fortresses."] }
  ];

  /* ---- Merge the curated rich entries onto the full generated DB.
     Every item, block and mob in the game comes from window.MC_DB
     (built from minecraft-data 1.20.2). Where a curated guide exists,
     it wins and is flagged guide:true; everything else still gets IDs,
     images and commands. --------------------------------------------- */
  var curatedById = {};
  CURATED.forEach(function (c) { curatedById[c.id] = c; });

  var ITEMS = [];
  var db = window.MC_DB || [];
  db.forEach(function (d) {
    var c = curatedById[d.id];
    if (c) {
      if (c.num == null) c.num = d.num;
      if (c.legacy == null) c.legacy = d.legacy;
      if (c.stack == null) c.stack = d.stack;
      if (!c.cat) c.cat = d.cat;
      if (!c.kind) c.kind = d.kind;
      if (c.hasItem == null) c.hasItem = d.hasItem;
      if (c.recs == null) c.recs = d.recs;
      if ((c.kind === "mob" || c.kind === "entity") && c.egg == null) c.egg = d.egg;
      c.guide = true;
      ITEMS.push(c);
      delete curatedById[d.id];
    } else {
      d.guide = false;
      ITEMS.push(d);
    }
  });
  // curated entries not present in the DB (rare id mismatches) still ship
  Object.keys(curatedById).forEach(function (id) {
    var c = curatedById[id]; c.guide = true; ITEMS.push(c);
  });
  // hard fallback if the DB failed to load
  if (!db.length) { ITEMS = CURATED.slice(); ITEMS.forEach(function (c) { c.guide = true; }); }

  // enchantments (generated) + potions + villager trades are their own kinds
  (window.MC_ENCH || []).forEach(function (e) { ITEMS.push(e); });
  (window.MC_POTIONS || []).forEach(function (p) { ITEMS.push(p); });
  (window.MC_TRADES || []).forEach(function (t) { t.guide = true; ITEMS.push(t); });

  /* ---- Family guides ------------------------------------------
     Variant items (every wood boat/door, every wool colour, ...) share
     behaviour with a base type. If an entry has no curated guide, it
     inherits the matching family's info so it never shows blank, while
     keeping its own IDs, image and crafting recipe. ------------------ */
  var FAMILIES = [
    [/(_chest_boat|_chest_raft)$/, { cat:"Boats", tool:"None", renew:true,
      obtain:"Craft a boat of the matching wood together with a chest.",
      find:"Crafted; occasionally found in structures.", farm:"Renewable from a tree farm.",
      uses:"A boat that also carries a chest (27 slots) across water.",
      notes:["All wood boats behave identically; only the look differs.","Right-click water or land to place.","Break it to recover the boat and chest."] }],
    [/(_boat|_raft)$/, { cat:"Boats", tool:"None", renew:true,
      obtain:"Craft 5 planks of the matching wood in a U shape.",
      find:"Crafted; sometimes in structures.", farm:"Renewable from a tree farm.",
      uses:"The fastest early-game water travel; carries two passengers or a mob.",
      notes:["Every wood boat behaves the same; only the look differs.","Bamboo uses a 'raft' instead of a boat.","Right-click to place on water or land."] }],
    [/_hanging_sign$/, { cat:"Signs", tool:"None (axe fastest)", renew:true,
      obtain:"Craft from 2 stripped logs of the matching wood + 2 chains.",
      find:"Crafted.", farm:"Renewable from a tree farm.",
      uses:"A hanging variant of the sign for labels and decoration.",
      notes:["Hangs under blocks or between chains.","Editable text on both sides.","All woods behave the same."] }],
    [/_sign$/, { cat:"Signs", tool:"None (axe fastest)", renew:true,
      obtain:"Craft from 6 planks of the matching wood + 1 stick (makes 3).",
      find:"Villages and structures.", farm:"Renewable from a tree farm.",
      uses:"Write up to 4 lines of text for labels, or use as decoration.",
      notes:["Right-click to edit the text.","Can be dyed and glow-inked.","All woods behave the same."] }],
    [/_door$/, { cat:"Doors", tool:"None (axe fastest)", renew:true,
      obtain:"Craft from 6 planks of the matching wood in two columns (makes 3).",
      find:"Villages and structures.", farm:"Renewable from a tree farm.",
      uses:"A 2-block-tall door you can open by hand and wire to redstone.",
      notes:["Zombies can break wooden doors on Hard difficulty.","Only the texture differs between woods (bamboo included).","Place two side by side for double doors."] }],
    [/_trapdoor$/, { cat:"Trapdoors", tool:"None (axe fastest)", renew:true,
      obtain:"Craft from 6 planks of the matching wood (makes 2).",
      find:"Villages and structures.", farm:"Renewable from a tree farm.",
      uses:"A hinged 1-block flap for hatches, mob traps and decoration.",
      notes:["Opens by hand or with redstone.","Can act as a ladder cap.","All woods behave the same."] }],
    [/_fence_gate$/, { cat:"Fences", tool:"None (axe fastest)", renew:true,
      obtain:"Craft from 2 sticks + 4 planks of the matching wood.",
      find:"Villages.", farm:"Renewable from a tree farm.",
      uses:"An openable gap in a fence line, and a barrier mobs can't cross.",
      notes:["Opens by hand or redstone.","Counts as full height for jumping.","All woods behave the same."] }],
    [/_fence$/, { cat:"Fences", tool:"None (axe fastest)", renew:true,
      obtain:"Craft from 4 planks of the matching wood + 2 sticks (makes 3).",
      find:"Villages and farms.", farm:"Renewable from a tree farm.",
      uses:"A 1.5-block barrier mobs and players can't jump over; connects into lines.",
      notes:["Leads can be tied to fence posts.","Connects to other fences and gates.","All woods behave the same."] }],
    [/_pressure_plate$/, { cat:"Redstone", tool:"None", renew:true,
      obtain:"Craft from 2 planks of the matching wood, or 2 of the stone/metal type.",
      find:"Structures.", farm:"Renewable.",
      uses:"Outputs a redstone signal when something stands on it.",
      notes:["Wooden plates trigger on any entity, even items.","Weighted (metal) plates output by count.","Great for doors and traps."] }],
    [/_button$/, { cat:"Redstone", tool:"None", renew:true,
      obtain:"Craft from 1 plank of the matching wood, or 1 stone-type block.",
      find:"Structures.", farm:"Renewable.",
      uses:"A one-shot redstone pulse when pressed.",
      notes:["Wooden buttons can be triggered by arrows.","Auto-resets after a short delay.","Place on walls, floors or ceilings."] }],
    [/_banner_pattern$/, { cat:"Item", tool:"None", renew:false,
      obtain:"Craft, trade with villagers, or find in loot depending on the pattern.",
      find:"Loot and trades.", farm:null,
      uses:"Unlocks a special banner design on a loom.",
      notes:["Reusable on the loom, not consumed.","Some (globe, snout) are trade or loot only.","Applies one motif per use."] }],
    [/_banner$/, { cat:"Banners", tool:"None", renew:true,
      obtain:"Craft from 6 wool of the matching colour + 1 stick.",
      find:"Structures.", farm:"Renewable via sheep farms.",
      uses:"A tall decorative flag you layer with patterns and dyes.",
      notes:["Apply patterns on a loom.","Copy a design onto a map.","All base colours behave the same."] }],
    [/_wall$/, { cat:"Blocks", tool:"Pickaxe", renew:false,
      obtain:"Craft 6 of the matching block (makes 6), or use a stonecutter.",
      find:"Structures.", farm:null,
      uses:"A 1.5-block barrier that connects into lines; decorative border.",
      notes:["Raises a post when something sits on top.","Mobs can't jump over walls.","All wall types behave the same."] }],
    [/_stairs$/, { cat:"Blocks", tool:"Pickaxe or axe (matches the block)", renew:false,
      obtain:"Craft 6 of the matching block in a staircase (makes 4), or use a stonecutter.",
      find:"Structures.", farm:null,
      uses:"Half-step block for roofs, seating and slopes.",
      notes:["Can be placed upside-down.","Waterloggable.","All stair types behave the same."] }],
    [/_slab$/, { cat:"Blocks", tool:"Pickaxe or axe (matches the block)", renew:false,
      obtain:"Craft 3 of the matching block in a row (makes 6), or use a stonecutter.",
      find:"Structures.", farm:null,
      uses:"Half-height block; two stack into a full block and stop mob spawns on top.",
      notes:["Place high or low in a block.","Double slabs merge into a full block.","Waterloggable."] }],
    [/_planks$/, { cat:"Blocks", tool:"None (axe fastest)", renew:true,
      obtain:"Craft from any log or wood of the matching tree (1 log = 4 planks).",
      find:"Village houses and structures.", farm:"Renewable from a tree farm.",
      uses:"Core crafting material for tools, chests, doors, boats and building.",
      notes:["All plank types share the same recipes.","Fuel for furnaces.","Only the colour differs."] }],
    [/^stripped_/, { cat:"Blocks", tool:"None (axe fastest)", renew:true,
      obtain:"Use an axe on the matching log or wood block to strip off the bark.",
      find:"Created by stripping logs.", farm:"Renewable from a tree farm.",
      uses:"A clean, bark-free building block; also crafts hanging signs.",
      notes:["Right-click a log with an axe to strip it.","Can be rotated on any axis.","All woods behave the same."] }],
    [/(_wood|_hyphae)$/, { cat:"Blocks", tool:"None (axe fastest)", renew:true,
      obtain:"Craft from 4 of the matching logs/stems (makes 3), or find on trees.",
      find:"Forests (as part of trees).", farm:"Renewable from a tree farm.",
      uses:"A block with bark on all six sides, for building.",
      notes:["'Hyphae' is the Nether (crimson/warped) equivalent.","Strips into stripped wood.","All woods behave the same."] }],
    [/(_log$)|^(crimson|warped)_stem$/, { cat:"Blocks", tool:"None (axe fastest)", renew:true,
      obtain:"Chop the matching tree with an axe (fastest) or by hand.",
      find:"Trees in the biome the wood comes from.", farm:"Plant saplings for a renewable tree farm.",
      uses:"Planks, charcoal (Overworld woods), and stripped/wood building blocks.",
      notes:["1 log = 4 planks.","Strip with an axe for a clean look.","Nether stems don't burn or make charcoal."] }],
    [/_leaves$/, { cat:"Blocks", tool:"Shears or Silk Touch (to keep the block)", renew:true,
      obtain:"Break the matching tree's leaves; shears/Silk Touch keep the block, else you get saplings and sometimes sticks or apples.",
      find:"On trees.", farm:"Renewable from a tree farm.",
      uses:"Decoration, hedges, and a renewable sapling source.",
      notes:["Decay when no log is nearby, unless placed.","Shears collect them whole.","All leaf types behave the same."] }],
    [/_(sapling|propagule)$/, { cat:"Plants", tool:"None", renew:true,
      obtain:"Break the matching tree's leaves for a chance to drop one.",
      find:"Under trees.", farm:"Plant on dirt/grass and bone-meal for a fast tree farm.",
      uses:"Grows into the matching tree.",
      notes:["Needs space and light to grow.","Bone meal speeds it up.","Some woods need 2x2 saplings for large trees."] }],
    [/_wool$/, { cat:"Blocks", tool:"None (shears fastest)", renew:true,
      obtain:"Shear or kill a sheep of the matching colour, or dye white wool.",
      find:"On sheep.", farm:"Shear-and-regrow sheep farms are fully renewable.",
      uses:"Beds, banners, carpets, paintings and colourful building.",
      notes:["Dye any wool to recolour it.","Sheep regrow wool after eating grass.","All colours behave the same."] }],
    [/_carpet$/, { cat:"Blocks", tool:"None", renew:true,
      obtain:"Craft from 2 wool of the matching colour (makes 3).",
      find:"Villages.", farm:"Renewable via sheep farms.",
      uses:"A thin floor covering for decoration; can sit on most blocks.",
      notes:["Doesn't block light or movement much.","Place on fences and llamas.","All colours behave the same."] }],
    [/_bed$/, { cat:"Blocks", tool:"None", renew:true,
      obtain:"Craft from 3 wool of the matching colour + 3 planks.",
      find:"Villages.", farm:"Renewable via sheep and tree farms.",
      uses:"Sleep to skip night and set your spawn point.",
      notes:["Right-click to set spawn.","Two blocks long; needs space.","Explodes if used in the Nether or End."] }],
    [/_candle$/, { cat:"Blocks", tool:"None", renew:true,
      obtain:"Craft 1 honeycomb + 1 string, then dye for colours.",
      find:"Crafted.", farm:"Renewable via bee farms.",
      uses:"A small light source; up to 4 per block, and lights cakes.",
      notes:["Light with flint & steel.","Stack up to 4 for more light.","Waterloggable, but unlit under water."] }],
    [/_concrete_powder$/, { cat:"Blocks", tool:"None (shovel fastest)", renew:false,
      obtain:"Craft 4 sand + 4 gravel + 1 dye of the matching colour (makes 8).",
      find:"Crafted.", farm:null,
      uses:"Falls like sand; touches water to harden into concrete.",
      notes:["Affected by gravity.","Turns into concrete on contact with water.","All colours behave the same."] }],
    [/_concrete$/, { cat:"Blocks", tool:"Pickaxe", renew:false,
      obtain:"Place the matching concrete powder next to water so it hardens.",
      find:"Made from concrete powder.", farm:null,
      uses:"A solid, vivid, matte building block.",
      notes:["Harder than powder; needs a pickaxe.","Doesn't fall once hardened.","All colours behave the same."] }],
    [/_glazed_terracotta$/, { cat:"Blocks", tool:"Pickaxe", renew:false,
      obtain:"Smelt the matching coloured terracotta in a furnace.",
      find:"Crafted.", farm:null,
      uses:"A glossy, patterned block that tiles when rotated.",
      notes:["Rotate to line up patterns.","Drops instead of moving with pistons.","All colours behave the same."] }],
    [/_terracotta$/, { cat:"Blocks", tool:"Pickaxe", renew:false,
      obtain:"Craft 8 terracotta + 1 dye of the matching colour (makes 8), or dye it.",
      find:"Plain variants generate in badlands.", farm:null,
      uses:"A warm, muted building block popular for pixel art.",
      notes:["Plain terracotta comes from smelting clay.","Blast-resistant.","All colours behave the same."] }],
    [/_stained_glass_pane$/, { cat:"Blocks", tool:"None (Silk Touch to keep)", renew:false,
      obtain:"Craft 6 of the matching stained glass in a row (makes 16), or dye glass panes.",
      find:"Crafted.", farm:null,
      uses:"Thin coloured windows that connect to their neighbours.",
      notes:["Breaks into nothing without Silk Touch.","Connects like iron bars.","All colours behave the same."] }],
    [/_stained_glass$/, { cat:"Blocks", tool:"None (Silk Touch to keep)", renew:false,
      obtain:"Craft 8 glass + 1 dye of the matching colour (makes 8).",
      find:"Crafted.", farm:null,
      uses:"Coloured see-through block; also tints a beacon beam.",
      notes:["Breaks into nothing without Silk Touch.","Tints beacon beams.","All colours behave the same."] }],
    [/shulker_box$/, { cat:"Blocks", tool:"Pickaxe", renew:true,
      obtain:"Craft 2 shulker shells + 1 chest; dye it any colour.",
      find:"Crafted from shulker shells (End cities).", farm:"Shulker farms in the End make shells renewable.",
      uses:"27 slots of portable storage that keep their contents when broken.",
      notes:["Keeps items inside when mined.","Can't nest one box inside another.","Dye to recolour without losing contents."] }],
    [/_pottery_sherd$/, { cat:"Item", tool:"None", renew:false,
      obtain:"Brush suspicious sand or gravel at archaeology sites.",
      find:"Trail ruins, desert wells and desert pyramids.", farm:null,
      uses:"Decorate a pot: combine 4 sherds (or bricks) into a decorated pot.",
      notes:["Each sherd shows a unique picture.","Found only by brushing suspicious blocks.","Mix with bricks for plain sides."] }],
    [/_spawn_egg$/, { cat:"Spawn Eggs", tool:"None", renew:false,
      obtain:"Available in the Creative inventory (not craftable in Survival).",
      find:"Creative mode.", farm:null,
      uses:"Right-click to spawn the matching mob.",
      notes:["In Survival use /summon or the mob's spawn conditions.","Coloured after its mob.","Can change a spawner's mob in Creative."] }],
    [/_dye$/, { cat:"Item", tool:"None", renew:true,
      obtain:"Craft from the matching flower or plant, or combine other dyes.",
      find:"Flowers and plants across biomes.", farm:"Renewable via flower and plant farms.",
      uses:"Colour wool, terracotta, glass, beds, banners, leather armour and more.",
      notes:["16 dye colours in total.","Mix dyes for secondary colours.","Applies to many blocks and items."] }],
    [/_ore$/, { cat:"Ore & Minerals", tool:"Pickaxe (correct tier)", renew:false,
      obtain:"Mine the matching ore with a suitable pickaxe.",
      find:"Underground at the ore's usual depth; deepslate variants below Y 0.", farm:null,
      uses:"Drops its raw material or gem; smelt raw metals into ingots.",
      notes:["Silk Touch collects the ore block itself.","Fortune boosts gem and dust drops.","Deepslate variants are tougher to mine."] }]
  ];

  function applyFamily(it) {
    for (var i = 0; i < FAMILIES.length; i++) {
      if (FAMILIES[i][0].test(it.id)) {
        var g = FAMILIES[i][1];
        for (var k in g) { if (k !== "cat" && it[k] == null) it[k] = g[k]; }
        if (g.cat && (it.cat === "Item" || it.cat === "Block")) it.cat = g.cat;
        it.guide = true;
        it.fam = true;
        return;
      }
    }
  }
  ITEMS.forEach(function (it) {
    if (!it.guide && it.kind !== "mob" && it.kind !== "entity") applyFamily(it);
  });

  /* ---- Search index ------------------------------------------ */
  ITEMS.forEach(function (it) {
    if (!it.kind) it.kind = "item";
    if (it.hasItem == null) it.hasItem = true;
    if (it.stack == null) it.stack = 64;
    if (!it.img) it.img = it.id;
    it._hay = (it.name + " " + it.id + " " + (it.legacy || "") + " " + it.cat + " " + it.kind).toLowerCase();
  });

  /* Fuzzy scorer: exact > prefix > word-start > substring > subsequence. */
  function score(q, it) {
    var name = it.name.toLowerCase();
    var id = it.id.toLowerCase();
    if (name === q || id === q) return 1000;
    if (name.indexOf(q) === 0 || id.indexOf(q) === 0) return 800 - name.length;
    // word-start match (e.g. "cane" -> "sugar cane")
    var words = name.split(/[ _]/);
    for (var i = 0; i < words.length; i++) {
      if (words[i].indexOf(q) === 0) return 640 - name.length;
    }
    var sub = it._hay.indexOf(q);
    if (sub !== -1) return 480 - sub - name.length * 0.1;
    // subsequence (typo/gap tolerant): "dimond" -> "diamond"
    var qi = 0;
    for (var j = 0; j < name.length && qi < q.length; j++) {
      if (name[j] === q[qi]) qi++;
    }
    if (qi === q.length) return 200 - (name.length - q.length);
    return -1;
  }

  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    var out = [];
    for (var i = 0; i < ITEMS.length; i++) {
      var s = score(q, ITEMS[i]);
      if (s > 0) out.push({ it: ITEMS[i], s: s });
    }
    out.sort(function (a, b) { return b.s - a.s || a.it.name.localeCompare(b.it.name); });
    return out.map(function (o) { return o.it; });
  }

  /* ---- DOM refs ---------------------------------------------- */
  var $ = function (id) { return document.getElementById(id); };
  var input = $("mcSearch");
  var results = $("mcResults");
  var view = $("mcView");
  var empty = $("mcEmpty");
  var edition = "java"; // or "bedrock"

  var activeIndex = -1;
  var currentList = [];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function iconImg(it, cls) {
    if (it.kind === "mob" || it.kind === "entity") {
      // bundled render -> bundled spawn-egg sprite -> barrier
      return '<img class="' + cls + ' mc-mob-img" loading="lazy" alt="' + esc(it.name) + '" ' +
        'src="' + MOB_IMG + it.id + '.png" data-local="' + ITEMS_IMG + it.id + '_spawn_egg.png" onerror="__mcImgErr(this)">';
    }
    // Spawn eggs: the CDN still serves the old plain-white eggs, so prefer
    // the bundled wiki icon and fall back to the CDN only if it is missing.
    if (/_spawn_egg$/.test(it.id)) {
      return '<img class="' + cls + '" loading="lazy" alt="' + esc(it.name) + ' icon" ' +
        'src="' + ITEMS_IMG + it.id + '.png" data-local="' + ICON + it.id + '.png" onerror="__mcImgErr(this)">';
    }
    // enchantments/potions use the bundled game texture (enchanted_book / potion)
    if (it.kind === "ench" || it.kind === "potion") {
      return '<img class="' + cls + '" loading="lazy" alt="' + esc(it.name) + ' icon" ' +
        'src="' + TEX + "item/" + it.img + '.png" data-local="' + ICON + it.img + '.png" onerror="__mcImgErr(this)">';
    }
    var key = it.img || it.id;
    return '<img class="' + cls + '" loading="lazy" alt="' + esc(it.name) + ' icon" ' +
      'src="' + ICON + key + '.png" data-local="' + ITEMS_IMG + it.id + '.png" onerror="__mcImgErr(this)">';
  }

  // small icon for a single crafting-grid ingredient (by item id)
  function slotImg(id) {
    return '<img class="mc-slot-icon" loading="lazy" alt="' + esc(id) + '" ' +
      'src="' + ICON + id + '.png" data-local="' + ITEMS_IMG + id + '.png" onerror="__mcImgErr(this)">';
  }

  // build the 3x3 crafting panel (always 3x3 for consistency)
  var craftIdx = 0; // which recipe is shown for the current item
  function craftPanel(it) {
    var recs = it.recs;
    if (!recs || !recs.length) return "";
    var idx = Math.max(0, Math.min(craftIdx, recs.length - 1));
    var rec = recs[idx];
    var cells = "";
    for (var i = 0; i < 9; i++) {
      var cid = rec.g[i];
      cells += cid
        ? '<div class="mc-slot" title="' + esc(cid) + '">' + slotImg(cid) + "</div>"
        : '<div class="mc-slot mc-slot-empty"></div>';
    }
    var cnt = rec.n > 1 ? '<span class="mc-craft-count">' + rec.n + "</span>" : "";
    var multi = recs.length > 1;
    var nav = multi
      ? '<div class="mc-craft-nav">' +
          '<button type="button" class="mc-craft-prev" aria-label="Previous recipe">&#8249;</button>' +
          '<span class="mc-craft-idx">' + (idx + 1) + " / " + recs.length + "</span>" +
          '<button type="button" class="mc-craft-next" aria-label="Next recipe">&#8250;</button>' +
        "</div>"
      : "";
    return '<div class="mc-craft">' +
      '<div class="mc-craft-label">Crafting recipe' +
        (multi ? ' <span class="mc-sub-note">' + recs.length + " ways</span>" : "") + "</div>" +
      '<div class="mc-craft-io">' +
        '<div class="mc-craft-grid">' + cells + "</div>" +
        '<span class="mc-craft-arrow" aria-hidden="true">&rarr;</span>' +
        '<div class="mc-slot mc-slot-out">' + iconImg(it, "mc-slot-icon") + cnt + "</div>" +
        nav +
      "</div>" +
    "</div>";
  }

  /* ---- Texture panel: every flat 2D PNG (item/block faces/entity) --- */
  function texturePanel(it) {
    var list = (window.MC_TEX && window.MC_TEX[it.id]) || null;
    if (!list || !list.length) return "";
    var items = list.map(function (t) {
      var url = TEX + t.p;
      var fname = t.p.split("/").pop();
      return '<button type="button" class="mc-tex-item" data-tex="' + esc(url) + '" data-name="' + esc(fname) +
        '" title="Download ' + esc(t.l) + ' (' + esc(fname) + ')">' +
        '<span class="mc-tex-preview"><img loading="lazy" alt="' + esc(it.name + " " + t.l + " texture") +
          '" src="' + esc(url) + '" onerror="var b=this.closest(\'.mc-tex-item\'); if(b) b.style.display=\'none\'"></span>' +
        '<span class="mc-tex-lbl">' + esc(t.l) + "</span>" +
      "</button>";
    }).join("");
    return '<div class="mc-tex">' +
      '<div class="mc-panel-title">Textures <span class="mc-sub-note">PNG &middot; click to download</span></div>' +
      '<div class="mc-tex-grid">' + items + "</div>" +
    "</div>";
  }

  /* ---- Sounds panel (mobs): play + download bundled .ogg -------- */
  function soundsPanel(it) {
    var snd = (window.MC_SOUNDS && window.MC_SOUNDS[it.id]) || null;
    if (!snd || !snd.length) return "";
    var rows = snd.map(function (s) {
      var src = MOB_SND + s.f;
      return '<div class="mc-snd-row">' +
        '<button type="button" class="mc-snd-play" data-src="' + esc(src) + '">' +
          '<span class="mc-snd-ic" aria-hidden="true">&#9654;</span>' + esc(s.label) +
        "</button>" +
        '<button type="button" class="mc-mini-btn mc-snd-dl" data-src="' + esc(src) +
          '" data-name="' + esc(it.id + "_" + s.label.toLowerCase() + ".ogg") + '" title="Download .ogg">&#8595;</button>' +
      "</div>";
    }).join("");
    return '<div class="mc-sounds">' +
      '<div class="mc-panel-title">Sounds <span class="mc-sub-note">.ogg</span></div>' +
      '<div class="mc-snd-list">' + rows + "</div>" +
    "</div>";
  }

  /* ---- Mob drops (from loot tables) --------------------------- */
  function dropsBlock(it) {
    var d = (window.MC_DROPS && window.MC_DROPS[it.id]) || null;
    if (!d || !d.length) return "";
    var cells = d.map(function (dr) {
      var meta = [dr.count];
      if (dr.loot) meta.push(dr.loot);
      if (dr.cond) meta.push(dr.cond);
      return '<div class="mc-drop">' +
        '<div class="mc-slot mc-drop-slot" title="' + esc(dr.id) + '">' + slotImg(dr.id) + "</div>" +
        '<div class="mc-drop-info"><span class="mc-drop-name">' + esc(dr.name) + "</span>" +
        '<span class="mc-drop-meta">' + esc(meta.join(" · ")) + "</span></div>" +
      "</div>";
    }).join("");
    return '<div class="mc-info-block mc-info-drops"><h3>Drops</h3><div class="mc-drops">' + cells + "</div></div>";
  }

  /* ---- Item sources & odds (reverse loot-table index) --------- */
  function sourcesBlock(it, srcId) {
    var s = (window.MC_SOURCES && window.MC_SOURCES[srcId || it.id]) || null;
    if (!s) return "";
    function chip(name, pct) {
      return '<span class="mc-src-chip">' +
        (pct != null ? '<span class="mc-src-bar" style="width:' + Math.min(100, pct) + '%"></span>' : "") +
        '<span class="mc-src-name">' + esc(name) + "</span>" +
        (pct != null ? '<span class="mc-src-pct">' + pct + "%</span>" : "") +
      "</span>";
    }
    function group(label, chips) {
      return chips ? '<div class="mc-src-group"><span class="mc-src-label">' + label +
        '</span><div class="mc-src-chips">' + chips + "</div></div>" : "";
    }
    var groups = "";
    if (s.mobs) groups += group("Mob drops", s.mobs.map(function (m) { return chip(m.name); }).join(""));
    if (s.chests) groups += group("Loot chests", s.chests.map(function (c) { return chip(c.t, c.c); }).join(""));
    if (s.fishing) groups += group("Fishing", chip(s.fishing.cat + " pool", s.fishing.pct));
    if (s.barter) groups += group("Bartering", chip("Piglin (for gold)"));
    if (!groups) return "";
    return '<div class="mc-info-block mc-info-sources"><h3>Sources &amp; odds</h3>' + groups +
      '<p class="mc-src-note">Chest odds are the approximate chance the item appears in that chest type. Fishing odds are per catch at base luck.</p></div>';
  }

  /* ---- Play + download helpers -------------------------------- */
  var _audio = null;
  function playSound(src, btn) {
    if (_audio) { _audio.pause(); }
    document.querySelectorAll(".mc-snd-play.playing").forEach(function (b) { b.classList.remove("playing"); });
    _audio = new Audio(src);
    if (btn) {
      btn.classList.add("playing");
      _audio.addEventListener("ended", function () { btn.classList.remove("playing"); });
      _audio.addEventListener("error", function () { btn.classList.remove("playing"); });
    }
    _audio.play().catch(function () {});
  }
  function downloadFile(url, filename) {
    fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
      var a = document.createElement("a");
      var u = URL.createObjectURL(b);
      a.href = u; a.download = filename || "";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1500);
    }).catch(function () { window.open(url, "_blank"); });
  }

  /* ---- Autocomplete dropdown --------------------------------- */
  function renderResults(list) {
    currentList = list;
    activeIndex = -1;
    if (!list.length) {
      results.innerHTML = input.value.trim()
        ? '<li class="mc-nohit">No match. Try another name.</li>'
        : "";
      results.classList.toggle("open", !!input.value.trim());
      return;
    }
    results.innerHTML = list.slice(0, 8).map(function (it, i) {
      var kind = (it.kind === "mob" || it.kind === "entity") ? "Mob"
        : it.kind === "block" ? "Block"
        : it.kind === "ench" ? "Ench"
        : it.kind === "potion" ? "Potion"
        : it.kind === "trade" ? "Trade" : "Item";
      return '<li class="mc-hit" role="option" data-i="' + i + '">' +
        iconImg(it, "mc-hit-icon") +
        '<span class="mc-hit-name">' + esc(it.name) + '</span>' +
        '<span class="mc-hit-kind mc-k-' + kind.toLowerCase() + '">' + kind + '</span>' +
        '<span class="mc-hit-id">' + esc(it.id) + '</span></li>';
    }).join("");
    results.classList.add("open");
  }

  function highlight(delta) {
    var items = results.querySelectorAll(".mc-hit");
    if (!items.length) return;
    activeIndex = (activeIndex + delta + items.length) % items.length;
    items.forEach(function (el, i) { el.classList.toggle("active", i === activeIndex); });
    items[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function closeResults() {
    results.classList.remove("open");
    results.innerHTML = "";
    activeIndex = -1;
  }

  /* ---- Commands ---------------------------------------------- */
  function commandsFor(it) {
    var ns = edition === "java" ? "minecraft:" : "";
    if (it.kind === "ench") {
      return [{ label: "Give book at level " + it.maxLevel,
        cmd: '/give @p enchanted_book{StoredEnchantments:[{id:"minecraft:' + it.id + '",lvl:' + it.maxLevel + '}]} 1' }];
    }
    if (it.kind === "trade") {
      if (it.prof === "wandering_trader") return [{ label: "Summon", cmd: "/summon minecraft:wandering_trader ~ ~ ~" }];
      return [{ label: "Summon (master)",
        cmd: '/summon minecraft:villager ~ ~ ~ {VillagerData:{profession:"minecraft:' + it.prof + '",level:5,type:"minecraft:plains"}}' }];
    }
    if (it.kind === "potion") {
      var rows = [{ label: "Potion", cmd: '/give @p potion{Potion:"minecraft:' + it.id + '"} 1' }];
      if (!it.base) {
        rows.push({ label: "Splash", cmd: '/give @p splash_potion{Potion:"minecraft:' + it.id + '"} 1' });
        rows.push({ label: "Lingering", cmd: '/give @p lingering_potion{Potion:"minecraft:' + it.id + '"} 1' });
      }
      return rows;
    }
    if (it.kind === "entity" || it.kind === "mob") {
      var erows = [{ label: "Summon", cmd: "/summon " + ns + it.id + (edition === "java" ? " ~ ~ ~" : "") }];
      if (it.egg !== false) erows.push({ label: "Give spawn egg", cmd: "/give @p " + ns + it.id + "_spawn_egg 1" });
      return erows;
    }
    if (it.hasItem === false) return []; // technical block with no item form
    var one = "/give @p " + ns + it.id + " 1";
    var stack = "/give @p " + ns + it.id + " " + it.stack;
    var rows = [{ label: "Give (1)", cmd: one }];
    if (it.stack > 1) rows.push({ label: "Give (full stack " + it.stack + ")", cmd: stack });
    return rows;
  }

  /* ---- Item view --------------------------------------------- */
  function bullet(label, value) {
    if (value == null || value === "") return "";
    return '<div class="mc-fact"><span class="mc-fact-k">' + label +
      '</span><span class="mc-fact-v">' + esc(value) + "</span></div>";
  }

  function renderView(it) {
    empty.hidden = true;
    view.hidden = false;

    var cmdRows = commandsFor(it);
    var cmds = cmdRows.length
      ? cmdRows.map(function (c) {
          return '<div class="mc-cmd">' +
            '<code class="mc-cmd-text">' + esc(c.cmd) + "</code>" +
            '<button class="mc-copy" type="button" data-copy="' + esc(c.cmd) +
            '" aria-label="Copy command">Copy</button></div>';
        }).join("")
      : '<p class="mc-cmd-none">No item form, so this block can\'t be given. Place it in Creative or via a structure.</p>';

    var notes = (it.notes || []).map(function (n) {
      return "<li>" + esc(n) + "</li>";
    }).join("");

    var isEnt = it.kind === "entity" || it.kind === "mob";
    var isEnch = it.kind === "ench";
    var isPotion = it.kind === "potion";
    var isTrade = it.kind === "trade";
    var showEd = !(isEnch || isPotion || isTrade);

    function infoBlock(h, v) {
      return v ? '<div class="mc-info-block"><h3>' + h + "</h3><p>" + esc(v) + "</p></div>" : "";
    }
    function idRow(k, v, copy) {
      return '<div class="mc-id-row"><span class="mc-id-k">' + k + '</span><code class="mc-id-v"' +
        (copy ? ' data-copy="' + esc(copy) + '"' : "") + ">" + v + "</code></div>";
    }
    var idFull = "minecraft:" + esc(it.id);
    var idRowsHtml, facts, infoHtml;

    if (isEnch) {
      idRowsHtml = idRow("Enchantment ID", idFull, "minecraft:" + it.id) +
        idRow("Max level", esc(it.maxRoman) + " (" + it.maxLevel + ")") +
        idRow("Rarity", esc(it.rarity));
      facts = bullet("Applies to", it.applies) +
        bullet("Source", it.treasure ? "Treasure only" : "Table / anvil / trades") +
        bullet("Selection weight", it.weight + " (" + it.rarity + ")");
      var obtainT = it.treasure
        ? "Treasure enchantment: found on enchanted books in loot chests, fishing, raids and villager trades. It can't be rolled at an enchanting table."
        : "Apply it at an enchanting table, combine an enchanted book on an anvil, or trade for it with a librarian villager.";
      var enotes = ["Higher selection weight means it appears more often when enchanting."];
      if (it.curse) enotes.push("This is a curse: it has a downside and only a grindstone removes it (which strips every enchantment).");
      enotes.push(it.tradeable ? "Available from librarian villager trades." : "Not available from villager trades.");
      enotes.push("Books found in loot or fishing carry a random enchantment; the odds below are for enchanted books in general.");
      var enotesHtml = enotes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("");
      infoHtml = infoBlock("How to get", obtainT) +
        (it.incompat && it.incompat.length
          ? '<div class="mc-info-block"><h3>Incompatible with</h3><p>' + esc(it.incompat.join(", ")) + "</p></div>"
          : "") +
        '<div class="mc-info-block mc-info-notes"><h3>Good to know</h3><ul>' + enotesHtml + "</ul></div>" +
        sourcesBlock(it, "enchanted_book");
    } else if (isTrade) {
      idRowsHtml = idRow("Profession", esc(it.name)) +
        idRow("Job block", esc(it.job)) +
        idRow("Trade tiers", "Novice &rarr; Master");
      facts = bullet("Job block", it.job) + bullet("Currency", "Emeralds") + bullet("Renewable", "Yes");
      var sells = (it.sells || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
      var tbuys = (it.buys || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
      infoHtml =
        (sells ? '<div class="mc-info-block mc-info-notes"><h3>Sells (you buy for emeralds)</h3><ul>' + sells + "</ul></div>" : "") +
        (tbuys ? '<div class="mc-info-block mc-info-notes"><h3>Buys (you sell for emeralds)</h3><ul>' + tbuys + "</ul></div>" : "") +
        (notes ? '<div class="mc-info-block mc-info-notes"><h3>Good to know</h3><ul>' + notes + "</ul></div>" : "");
    } else if (isPotion) {
      idRowsHtml = idRow("Potion ID", idFull, "minecraft:" + it.id) +
        idRow("Type", esc(it.type)) +
        idRow("Duration", esc(it.duration));
      facts = bullet("Effect type", it.type) +
        bullet("Level II", it.level2 ? "Yes" : "No") +
        bullet("Bottles", it.base ? "Drinkable" : "Drink / Splash / Lingering");
      var mods = [];
      if (it.level2) mods.push("Add glowstone dust for a level II potion.");
      if (it.extend) mods.push("Add redstone dust to extend the duration.");
      mods.push("Add gunpowder to make a splash potion, then dragon's breath for a lingering one.");
      infoHtml = infoBlock("Effect", it.effect) +
        infoBlock("Brewing", it.brew) +
        (it.base ? "" : infoBlock("Stronger / longer", mods.join(" "))) +
        (notes ? '<div class="mc-info-block mc-info-notes"><h3>Good to know</h3><ul>' + notes + "</ul></div>" : "");
    } else {
      var noId = isEnt ? "- none" : "- none (post-1.13)";
      var idLabel = isEnt ? "Entity ID" : "Item ID";
      idRowsHtml = idRow(idLabel, idFull, "minecraft:" + it.id) +
        idRow("Legacy ID", it.legacy ? esc(it.legacy) : noId) +
        idRow("Numerical ID", it.num ? esc(it.num) : noId);
      var bf = window.MC_BLOCK && window.MC_BLOCK[it.id];
      var fuel = window.MC_FUEL && window.MC_FUEL[it.id];
      facts = isEnt
        ? bullet("Health", it.health) + bullet("Behavior", it.behavior) + bullet("Spawn egg", it.egg === false ? "No" : "Yes")
        : bullet("Stack size", it.stack) +
          bullet("Renewable", it.renew == null ? null : (it.renew ? "Yes" : "No")) +
          bullet("Tool", it.tool || (bf ? bf.t : null)) +
          bullet("Hardness", bf ? bf.h : null) +
          bullet("Blast resist.", bf ? bf.r : null) +
          bullet("Fuel", fuel != null ? "Smelts " + fuel + " item" + (fuel === 1 ? "" : "s") : null);
      infoHtml =
        infoBlock(isEnt ? "How it spawns" : "How to obtain", it.obtain) +
        infoBlock(isEnt ? "Where it spawns" : "Where to find", it.find) +
        infoBlock(isEnt ? "Farming &amp; breeding" : "Farming", it.farm) +
        infoBlock(isEnt ? "Drops &amp; uses" : "Uses", it.uses) +
        (notes ? '<div class="mc-info-block mc-info-notes"><h3>Good to know</h3><ul>' + notes + "</ul></div>" : "") +
        (isEnt ? dropsBlock(it) : sourcesBlock(it));
      if (!infoHtml) {
        infoHtml = '<div class="mc-info-block mc-no-guide"><p>No written guide for this one yet, but the IDs and commands above are ready to use. The popular items, blocks and mobs have full guides.</p></div>';
      }
    }

    view.innerHTML =
      '<div class="mc-card">' +
        // ----- Left: identity + IDs + commands -----
        '<div class="mc-col mc-col-left">' +
          '<div class="mc-head">' +
            '<div class="mc-icon-wrap">' + iconImg(it, "mc-icon") + "</div>" +
            '<div class="mc-head-text">' +
              '<span class="mc-cat">' + esc(it.cat) + "</span>" +
              "<h2 class=\"mc-name\">" + esc(it.name) + "</h2>" +
            "</div>" +
          "</div>" +

          '<div class="mc-ids">' + idRowsHtml + "</div>" +

          '<div class="mc-cmd-panel">' +
            '<div class="mc-panel-title">Commands' +
              (showEd
                ? '<span class="mc-ed-toggle" role="group" aria-label="Edition">' +
                    '<button type="button" class="mc-ed' + (edition === "java" ? " on" : "") + '" data-ed="java">Java</button>' +
                    '<button type="button" class="mc-ed' + (edition === "bedrock" ? " on" : "") + '" data-ed="bedrock">Bedrock</button>' +
                  "</span>"
                : (isEnch || isPotion ? '<span class="mc-sub-note">Java NBT</span>' : "")) +
            "</div>" +
            cmds +
          "</div>" +
          texturePanel(it) +
          soundsPanel(it) +
        "</div>" +

        // ----- Right: info -----
        '<div class="mc-col mc-col-right">' +
          '<div class="mc-quickfacts">' +
            facts +
          "</div>" +

          '<div class="mc-info">' +
            infoHtml +
          "</div>" +
          craftPanel(it) +
        "</div>" +
      "</div>";
  }

  var current = null;
  function selectItem(it) {
    current = it;
    craftIdx = 0;
    input.value = it.name;
    closeResults();
    renderView(it);
    if (history.replaceState) {
      history.replaceState(null, "", "#" + it.id);
    }
  }

  /* ---- Copy handling ----------------------------------------- */
  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = "Copied";
      btn.classList.add("copied");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("copied"); }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---- Events ------------------------------------------------ */
  input.addEventListener("input", function () {
    renderResults(search(input.value));
  });

  input.addEventListener("focus", function () {
    if (input.value.trim()) renderResults(search(input.value));
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!results.classList.contains("open")) renderResults(search(input.value)); highlight(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && currentList[activeIndex]) selectItem(currentList[activeIndex]);
      else if (currentList.length) selectItem(currentList[0]);
    } else if (e.key === "Escape") {
      closeResults();
    }
  });

  results.addEventListener("click", function (e) {
    var li = e.target.closest(".mc-hit");
    if (!li) return;
    var it = currentList[+li.dataset.i];
    if (it) selectItem(it);
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".mc-searchbar")) closeResults();

    var copyEl = e.target.closest("[data-copy]");
    if (copyEl) {
      copyText(copyEl.getAttribute("data-copy"), copyEl.classList.contains("mc-copy") ? copyEl : null);
      if (!copyEl.classList.contains("mc-copy")) flashCopy(copyEl);
    }

    var ed = e.target.closest(".mc-ed");
    if (ed && current) {
      edition = ed.dataset.ed;
      renderView(current);
    }

    var play = e.target.closest(".mc-snd-play");
    if (play) playSound(play.getAttribute("data-src"), play);

    var dl = e.target.closest(".mc-snd-dl");
    if (dl) downloadFile(dl.getAttribute("data-src"), dl.getAttribute("data-name"));

    var texitem = e.target.closest(".mc-tex-item");
    if (texitem) downloadFile(texitem.getAttribute("data-tex"), texitem.getAttribute("data-name"));

    var cnav = e.target.closest(".mc-craft-prev, .mc-craft-next");
    if (cnav && current && current.recs && current.recs.length > 1) {
      var len = current.recs.length;
      var dir = cnav.classList.contains("mc-craft-next") ? 1 : -1;
      craftIdx = ((craftIdx + dir) % len + len) % len;
      var panel = document.querySelector(".mc-craft");
      if (panel) panel.outerHTML = craftPanel(current);
    }
  });

  function flashCopy(el) {
    el.classList.add("copied");
    setTimeout(function () { el.classList.remove("copied"); }, 700);
  }

  // Global shortcut: "/" focuses search
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  /* ---- Init: deep-link + suggestion chips -------------------- */
  function byId(id) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
    return null;
  }

  // Suggestion chips (popular items)
  var chipWrap = $("mcChips");
  if (chipWrap) {
    ["diamond", "creeper", "mending", "healing", "crafting_table", "ender_dragon"]
      .forEach(function (id) {
        var it = byId(id);
        if (!it) return;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "mc-chip";
        b.textContent = it.name;
        b.addEventListener("click", function () { selectItem(it); });
        chipWrap.appendChild(b);
      });
  }

  var hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  var start = hash && byId(hash);
  if (start) selectItem(start);

  window.MC_ITEM_COUNT = ITEMS.length;
})();
