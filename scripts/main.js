import { Game_time } from "./game_time.js";
import { Item, item_templates } from "./items.js";
import { locations } from "./locations.js";

//player character
const character = {name: "Hero", titles: {}, 
				stats: {max_health: 100, health: 100, strength: 20, agility: 20, magic: 0, attack_speed: 1, crit_rate: 0.1, crit_multiplier: 1.2, attack_power: 0},
				// crit damage is a multiplier; defense should be only based on worn armor and/or magic skills;
				inventory: {},
				equipment: {head: null, torso: null, 
							arms: null, ring: null, 
							weapon: null, offhand: null,
							legs: null, feet: null, 
							amulet: null}};

//equipment slots, keep same order as in character eq slots
const equipment_slots_divs = {head: document.getElementById("head_slot"), torso: document.getElementById("torso_slot"),
							arms: document.getElementById("arms_slot"), ring: document.getElementById("ring_slot"),
							weapon: document.getElementById("weapon_slot"), offhand: document.getElementById("offhand_slot"),
							legs: document.getElementById("legs_slot"), feet: document.getElementById("feet_slot"),
							amulet: document.getElementById("amulet_slot")
							};		
							
const stats_divs = {strength: document.getElementById("strength_slot"), agility: document.getElementById("agility_slot"),
					magic: document.getElementById("magic_slot"), attack_speed: document.getElementById("attack_speed_slot"),
					attack_power: document.getElementById("attack_power_slot"), defense: document.getElementById("defense_slot"),
					crit_rate: document.getElementById("crit_rate_slot"), crit_multiplier: document.getElementById("crit_multiplier_slot")
					};

const other_combat_divs = { 
					
};

//current enemy
var current_enemy = null;
//additional attacks for combat
var additional_hero_attacks = 0;
var additional_enemy_attacks = 0;
//current location
var current_location;
//resting, true -> health regenerates
var is_resting = true;

//enemy crit stats
const enemy_crit_chance = 0.1;
const enemy_crit_damage = 2; //multiplier, not a flat bonus

//character healt display
const current_health_value_div = document.getElementById("character_health_value");
const current_health_bar = document.getElementById("character_healthbar_current");

//enemy health display
const current_enemy_health_value_div = document.getElementById("enemy_health_value");
const current_enemy_health_bar = document.getElementById("enemy_healthbar_current");
//enemy info
const enemy_info_div = document.getElementById("enemy_info_div");
const enemy_stats_div = document.getElementById("enemy_stats_div");
const enemy_name_div = document.getElementById("enemy_name_div");

//inventory display
const inventory_div = document.getElementById("inventory_content_div");

//character name
const name_field = document.getElementById("character_name_field");
name_field.value = character.name;

const message_log = document.getElementById("message_log_div");
const time_field = document.getElementById("time_div");

const action_div = document.getElementById("action_div");

const location_name_div = document.getElementById("location_name_div");
const location_description_div = document.getElementById("location_description_div");

//game time (years, months, days, hours, minutes)
const current_game_time = new Game_time(954, 4, 1, 8, 5);
time_field.innerHTML = current_game_time.toString();

// button testing cuz yes
document.getElementById("test_button").addEventListener("click", test_button);
function test_button() {
	//remove_from_inventory({name: "Rat fang", count: 2});
	//remove_from_inventory({name: "Ratslayer"});
	//equip_item({name: "Long stick", id: 0});
}


name_field.addEventListener("change", () => character.name = name_field.value.toString().trim().length>0?name_field.value:"Nameless Hero");

function change_location(location_name) {
	action_div.innerHTML = '';
	var location = locations[location_name];
	var action;
	if(typeof current_location !== "undefined") { //so it's not called when initializing the location on page load
		log_message(`[ Entering ${location.name} ]`);
	}
	
	if("connected_locations" in location) { // basically means it's a normal location and not a combat zone (as combat zone has only "parent")
		for(var i = 0; i < location.connected_locations.length; i++) {
			action = document.createElement("div");
			
			enemy_info_div.style.opacity = 0;

			if("connected_locations" in location.connected_locations[i]) {// check again if connected location is normal or combat
				action.classList.add("travel_normal");
				action.innerHTML = "Go to " + location.connected_locations[i].name;
			} else {
				action.classList.add("travel_combat");
				action.innerHTML = "Enter the " + location.connected_locations[i].name;
			}
			action.classList.add("action_travel");
			action.setAttribute("data-travel", location.connected_locations[i].name);
			action.setAttribute("onclick", "change_location(this.getAttribute('data-travel'));");

			action_div.appendChild(action);

			if(typeof current_location !== "undefined" && "parent_location" in current_location) {
				clear_enemy_and_enemy_info();
			}
		}
	} else {
		enemy_info_div.style.opacity = 1;

		action = document.createElement("div");
		action.classList.add("travel_normal", "action_travel");
		action.innerHTML = "Go back to " + location.parent_location.name;
		action.setAttribute("data-travel", location.parent_location.name);
		action.setAttribute("onclick", "change_location(this.getAttribute('data-travel'));");

		action_div.appendChild(action);
	}

	current_location = location;
	location_name_div.innerHTML = current_location.name;
	location_description_div.innerHTML = current_location.description;
}

window.change_location = change_location; //attaching to window, as otherwise it won't be visible from the index file

function get_new_enemy() {
	current_enemy = current_location.get_next_enemy();
	enemy_stats_div.innerHTML = `Str: ${current_enemy.strength} | Agl: ${current_enemy.agility}
	| Def: ${current_enemy.defense} | Atk speed: ${current_enemy.attack_speed.toFixed(1)}`

	enemy_name_div.innerHTML = current_enemy.name;

	update_displayed_enemy_health();

	//also show magic if not 0?
}

//single tick of fight
function do_combat() {
	if(current_enemy === null) {
		get_new_enemy();
		return;
	}

	//todo: separate formulas for physical and magical weapons
	//and also need weapons before that...

	var hero_hit_chance = Math.max(0.2, (character.stats.agility/current_enemy.agility)*0.5);
	//so 100% if at least twice more agility, 50% if same, and never less than 20%
	var hero_evasion_chance = Math.min(0.95, (character.stats.agility/current_enemy.agility)*0.33);
	//so up to 95% if at least thrice more agility, 33% if same, can go down to 0%
	//todo: make it 0% when using shield, only blocking will be possible with it

	var hero_base_damage = character.stats.attack_power;

	var enemy_base_damage = current_enemy.strength;

	var damage_dealt;

	var critted;

	var hero_defense = 0; //will be a sum of armor from worn equipment + maybe a bonus from some magic stuff

	if(character.stats.attack_speed > current_enemy.attack_speed) {
		additional_hero_attacks += (character.stats.attack_speed/current_enemy.attack_speed - 1);
		additional_enemy_attacks = 0;
	} else if (character.stats.attack_speed < current_enemy.attack_speed) {
		additional_enemy_attacks += (current_enemy.attack_speed/character.stats.attack_speed - 1);
		additional_hero_attacks = 0;
	}
	
	for(var i = 0; i <= additional_hero_attacks; i++) {
		if(i > 0) {
			additional_hero_attacks -= 1;
		}

		if(hero_hit_chance > Math.random()) {//hero's attack hits

			//todo: proper combat skill goes up a tiny bit

			damage_dealt = Math.round(hero_base_damage * (1.2 - Math.random() * 0.4));
			//small randomization by up to 20%
			
			if(character.stats.crit_rate > Math.random()) {
				damage_dealt = Math.round(damage_dealt * character.stats.crit_multiplier);
				critted = true;
			}
			else {
				critted = false;
			}
			
			damage_dealt = Math.max(damage_dealt - current_enemy.defense, 1);

			current_enemy.health -= damage_dealt;
			if(critted) {
				log_message(current_enemy.name + " was critically hit for " + damage_dealt + " dmg", "enemy_attacked_critically");
			}
			else {
				log_message(current_enemy.name + " was hit for " + damage_dealt + " dmg", "enemy_attacked");
			}


			if(current_enemy.health <= 0) {
				current_enemy.health = 0; 
				update_displayed_enemy_health();
				//just to not go negative on displayed health

				log_message(character.name + " has defeated " + current_enemy.name, "enemy_defeated");
				var loot = current_enemy.get_loot();
				if(loot.length > 0) {
					log_loot(loot);
					add_to_inventory(loot);
				}
				current_enemy = null;
				additional_enemy_attacks = 0;
				return;
			}

			update_displayed_enemy_health();
		} else {
			log_message(character.name + " has missed");
		}
	}

	for(var i = 0; i <= additional_enemy_attacks; i++)
	{
		if(i > 0) {
			additional_enemy_attacks -= 1;
		}
		if(hero_evasion_chance < Math.random()) {
			//hero gets hit (unless also has shield, then calculate shield blocking)
			damage_dealt = Math.round(enemy_base_damage * (1.2 - Math.random() * 0.4));
			//so it would then get multiplied by crit (if it happens)

			if(enemy_crit_chance > Math.random())
			{
				damage_dealt *= enemy_crit_damage;
				damage_dealt = Math.max(damage_dealt - hero_defense, 1);
				character.stats.health -= damage_dealt;
				log_message(character.name + " was critically hit for " + damage_dealt + " dmg", "hero_attacked_critically");
			} else {
				damage_dealt = Math.max(damage_dealt - hero_defense, 1);
				character.stats.health -= damage_dealt;
				log_message(character.name + " was hit for " + damage_dealt + " dmg", "hero_attacked");
			}

			if(character.stats.health <= 0) {
				log_message(character.name + " has lost consciousness", "hero_defeat");

				if(character.stats.health < 0) {
					character.stats.health = 0;
				}

				additional_hero_attacks = 0;
				current_enemy = null;
				change_location(current_location.parent_location.name);
				// todo: force to rest
			}
			update_displayed_health();
		} else {
			log_message(current_enemy.name + " has missed");
			// evasion skill goes up
		}
	}
	/* 
	 enemy is in a global variable
	 if killed, uses method of Location object to assign a random new enemy (of ones in Location) to that variable;
	 
	 todo: give xp
	 and also on each move, if character manages to hit/evade/block or gets hit (so basically however enemy's move goes,
	 except for when it dies and doesn't do anything), add xp to proper skills;
	 
	 attack dmg either based on strength + weapon stat, or some magic stuff?
	 maybe some weapons will be str based and will get some small bonus from magic if player has proper skill unlocked
	 (something like "weapon aura"), while others (wands and staffs) will be based purely on magic
	 single stat "magic" + multiple related skills?
	 also should offer a bit better scaling than strength, so worse at beginning but later on gets better?
	 also a magic resistance skill for player

	 block chance only when using shield, based on skill (40% at 0 skill, 80% at max?) but only if dmg is lower than shield strength
	 if it's higher, then block chance reduced to 10%-50% and defender take dmg equal to atk dmg - shield str?
	 also shield require some strength to use
	 */

}

//single tick of resting
function do_resting() {
	if(character.stats.health < character.stats.max_health)
	{
		var resting_heal_ammount = 1; //leave this flat and let it serve as passive regeneration, but also add sleeping that will heal faster and scale with level
		character.stats.health += (resting_heal_ammount);
		update_displayed_health();
	}
}


//writes message to the message log
function log_message(message_to_add, message_type) {
	//todo: add classes to message div, depending on message type (mainly for coloring)

	if(typeof message_to_add === 'undefined') {
		return;
	}

	var message = document.createElement("div");
	message.classList.add("message_common");

	var class_to_add = "message_default";

	//selects proper class to add based on argument
	//totally could have just passed class name as argument and use it instead of making this switch
	switch(message_type) {
		case "enemy_defeated":
			class_to_add = "message_victory";
			break;
		case "hero_defeat":
			class_to_add = "message_hero_defeated";
			break;
		case "enemy_attacked":
			class_to_add = "message_enemy_attacked";
			break;
		case "enemy_attacked_critically":
			class_to_add = "message_enemy_attacked_critically";
			break;
		case "hero_attacked":
			class_to_add = "message_hero_attacked";
			break;
		case "hero_attacked_critically":
			class_to_add = "message_hero_attacked_critically";
			break;
		case "combat_loot":
			class_to_add = "message_items_obtained";
			break;
	}

	message.classList.add(class_to_add);

	message.innerHTML = message_to_add + "<div class='message_border'> </>";


	if(message_log.children.length > 30) 
	{
		message_log.removeChild(message_log.children[0]);
	} //removes first position if there's too many messages

	message_log.appendChild(message);
	message_log.scrollTop = message_log.scrollHeight;
}

function log_loot(loot_list) {
	
	if(loot_list.length == 0) {
		return;
	}

	var message = "Looted " + loot_list[0]["item"]["name"] + " x" + loot_list[0]["count"];
	if(loot_list.length > 1) {
		for (var i = 1; i < loot_list.length; i++) {
			message += (", " + loot_list[i]["item"]["name"] + " x" + loot_list[i]["count"]);
		}
	} //this looks terrible

	log_message(message, "combat_loot");
	
}

function update_displayed_health() { //call it when eating, resting or getting hit
	current_health_value_div.innerHTML = character.stats.health + "/" + character.stats.max_health;
	current_health_bar.style.width = (character.stats.health*100/character.stats.max_health).toString() +"%";
}

function update_displayed_enemy_health() { //call it when getting new enemy and when enemy gets hit
	current_enemy_health_value_div.innerHTML = current_enemy.health + "/" + current_enemy.max_health;
	current_enemy_health_bar.style.width =  (current_enemy.health*100/current_enemy.max_health).toString() +"%";
}

function clear_enemy_and_enemy_info() {
	current_enemy = null;
	current_enemy_health_value_div.innerHTML = "0";
	current_enemy_health_bar.style.width = "100%";
	enemy_stats_div.innerHTML = `Str: 0 | Agl: 0 | Def: 0 | Magic: 0 | Atk speed: 0;`
	enemy_name_div.innerHTML = "None";
}

function add_to_inventory(items) {
	//console.log(items);
	for(var i = 0; i < items.length; i++){
		if(!character.inventory.hasOwnProperty(items[i].item.name)) //not in inventory
		{

			//
			// TODO: add proper click listeners to items that can be used in any way (equipped/consumed/dismantled?)
			//

			if(items[i].item.stackable)
			{
				character.inventory[items[i].item.name] = items[i];
			}
			else 
			{
				character.inventory[items[i].item.name] = [items[i].item];
			}
		}
		else //in inventory 
		{
			if(items[i].item.stackable)
			{
				character.inventory[items[i].item.name].count += items[i].count;
				console.log(items[i].count);
			} 
			else 
			{
				character.inventory[items[i].item.name].push(items[i].item);
			}
		}

	}
	update_displayed_inventory();
}

function remove_from_inventory(item_info) {
	//item info -> {name: X, count: X, id: X}, with either count or id, depending on if item is stackable or not

	if(character.inventory.hasOwnProperty(item_info.name)) { //check if its in inventory, just in case, probably not needed

		if(character.inventory[item_info.name].hasOwnProperty("item")) { //stackable
			//console.log(character.inventory[item_info.name].item.stackable);

			if(typeof item_info.count === "number" && Number.isInteger(item_info.count) && item_info.count >= 1) 
			{
				character.inventory[item_info.name].count -= item_info.count;
			} 
			else 
			{
				character.inventory[item_info.name].count -= 1;
			}

			if(character.inventory[item_info.name].count <= 0) 
			{
				delete character.inventory[item_info.name];
				//removes item frm inventory if it's county is less than 1
			}
		}
		else { //unstackable
			character.inventory[item_info.name].splice([item_info.id], 1);
			//removes item from the array
			//dont need to check if .id even exists, as splice by default uses 0

			if(character.inventory[item_info.name].length == 0) 
			{
				delete character.inventory[item_info.name];
				//removes item array from inventory if its empty
				//might be unnecessary, lets leave it for now
			} 
		}
	}

	update_displayed_inventory();
}

function dismantle_item() {
	//todo: this thing
	//priority: extremely low
}

function update_displayed_inventory() {
	//inventory only, equipped items separately
	//todo: do it only for changed items?
	
	inventory_div.innerHTML = "";

	Object.keys(character.inventory).forEach(function(key) {
		if(character.inventory[key] instanceof Array) //unstackables
		{ 
			for(var i = 0; i < character.inventory[key].length; i++) {
				var item_control_div = document.createElement("div");
				var item_div = document.createElement("div");
				//item_div is just name + item count (if stackable)

				
				item_div.innerHTML = `${character.inventory[key][i].name}`;
				item_div.classList.add("inventory_item");

				item_control_div.setAttribute("data-inventory_item", `${character.inventory[key][i].name} #${i}`)
				//shouldnt create any problems, as any change to inventory will also call this method, 
				//so removing/equipping any item wont cause mismatch

				item_control_div.classList.add(`item_${character.inventory[key][i].item_type.toLowerCase()}`);
				item_control_div.appendChild(item_div);

				if(character.inventory[key][i].item_type === "EQUIPPABLE") {
					var item_equip_div = document.createElement("div");
					item_equip_div.innerHTML = "E";
					item_equip_div.classList.add("equip_item_button");
					item_control_div.appendChild(item_equip_div);
				}

		   		inventory_div.appendChild(item_control_div);
			}
		} else //stackables
		{
			var item_control_div = document.createElement("div");
			var item_div = document.createElement("div");

			if(character.inventory[key].count > 1)
			{
				item_div.innerHTML = `${character.inventory[key].item.name} x${character.inventory[key].count}`;
			} else 
			{
				item_div.innerHTML = `${character.inventory[key].item.name}`;
			}
			item_div.classList.add("inventory_item");

			item_control_div.classList.add(`item_${character.inventory[key].item.item_type.toLowerCase()}`);
			item_control_div.setAttribute("data-inventory_item", `${character.inventory[key].item.name}`)
			item_control_div.appendChild(item_div);

		   	inventory_div.appendChild(item_control_div);
		}
	});
}

function equip_item(item_info) {
	//item info -> {name: X, count: X, id: X}, count currently not used
	
	if(character.inventory.hasOwnProperty(item_info.name)) { //check if its in inventory, just in case

		if(character.inventory[item_info.name].hasOwnProperty("item")) { //stackable
			console.log("not implemented");
		}
		else { //unstackable
			//add specific item to equipment slot
			// -> id and name tell which exactly item it is, then also check slot in item object and thats all whats needed
			const item = character.inventory[item_info.name][item_info.id];
			unequip_item(item.equip_slot);
			character.equipment[item.equip_slot] = item;

			update_displayed_equipment();
			update_displayed_inventory();
			update_character_stats();
			remove_from_inventory(item_info); //put both outside if() when equipping gets implemented for stackables as well
		}
	}
}

window.equip_item = equip_item;

function unequip_item(item_slot) {
	if(character.equipment[item_slot] != null) {
		add_to_inventory([{item: character.equipment[item_slot]}]);
		character.equipment[item_slot] = null;
		update_displayed_equipment();
		update_displayed_inventory();
		update_character_stats();
		console.log(character.inventory);
	}
}

function update_displayed_equipment() {
	Object.keys(equipment_slots_divs).forEach(function(key) {
		if(character.equipment[key] == null) {
			equipment_slots_divs[key].innerHTML = `${key} slot`;
			equipment_slots_divs[key].classList.add("equipment_slot_empty");
		}
		else 
		{
			equipment_slots_divs[key].innerHTML = character.equipment[key].name;
			equipment_slots_divs[key].classList.remove("equipment_slot_empty");
		}
	});
}

function update_character_stats() { //updates character stats
	if(character.equipment.weapon != null) { 

		if(typeof character.equipment.weapon.equip_effect.multipliers.attack !== "undefined" && character.equipment.weapon.equip_effect.multipliers.attack != null) {
			character.stats.attack_power = (character.stats.strength + character.equipment.weapon.equip_effect.stats.attack) * character.equipment.weapon.equip_effect.multipliers.attack;

		} 
		else {
			character.stats.attack_power = character.stats.strength + character.equipment.weapon.equip_effect.stats.attack;

		}
	} 

	else {
		character.stats.attack_power = character.stats.strength;
	}

	character.stats.defense  = 0; //TODO: calculate it based on armor values of equipped items
	character.stats.crit_rate = character.stats.crit_rate; //TODO: calculate it based on skills and equipment
	character.stats.crit_multiplier = character.stats.crit_multiplier; //TODO: calculate it based on skils and equipment

	update_displayed_stats();
}

function update_displayed_stats() { //updates displayed stats
	Object.keys(stats_divs).forEach(function(key){
		stats_divs[key].innerHTML = `${character.stats[key]}`
	});
}

function update_timer() {
	current_game_time.go_up();
	time_field.innerHTML = current_game_time.toString();
} //updates time div

function tick(tickrate, time_variance) {
	return new Promise(resolve => setTimeout(resolve, (1000 - time_variance)/tickrate));
} //ticks

function update() {
	//so technically everything is supposed to be happening in here
	//maybe just a bunch of IFs, checking what character is currently doing and acting properly?
	//i.e. fighting, sleeping, training, mining (if it even becomes a thing)
	//active skills, like eating, probably can be safely calculated outside of this?
	
	update_timer();

	if("parent_location" in current_location){ //if it's a combat_zone
		do_combat();
	} else { //everything other than combat
		if(is_resting) { //make a change so it only switches to true on clicking the resting action and is false on default
			do_resting();
		}
	}
}

async function run() {
	const tickrate = 1;
	//how many ticks per second
	//best leave it at 1, as less is rather slow, and more makes ticks noticably unstable

	var time_variance = 0;
	//how much deviated was duration of tick
	var accumulator = 0;
	//accumulates deviations

	var start_date;
	var end_date;

	if(typeof current_location === "undefined") {
		change_location("Village");
	} //to initialize the starting location
	//later on call it also in the save loading method

	update_displayed_health();

	while(true){
		start_date = new Date();

		await tick(tickrate, accumulator);
		//uses value from accumulator (instead of time_variance) for more precise overall stabilization
		//(instead of only stabilizing relative to previous tick, it now stabilizes relative to sum of deviations)
		update();
		end_date = new Date();

		time_variance = (end_date - start_date) - 1000/tickrate;
		accumulator += time_variance;

		//console.log((end_date - start_date).toString() + " : " + accumulator.toString());
	}
}

add_to_inventory([{item: new Item(item_templates["Ratslayer"])}, {item: new Item(item_templates["Ratslayer"])}]);
add_to_inventory([{item: new Item(item_templates["Ratslayer"])}]);
add_to_inventory([{item: new Item(item_templates["Rat fang"]), count: 5}]);
add_to_inventory([{item: new Item(item_templates["Long stick"])}]);
equip_item({name: "Ratslayer", id: 1});
equip_item({name: "Long stick", id: 0});
update_displayed_stats();
run();
