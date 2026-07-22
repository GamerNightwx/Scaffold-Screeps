1. Game UI and basic scripting

Welcome to Screeps!

This tutorial will help you learn basic game concepts step by step. You can take it later, but we strongly advise you to do it now, before you start a real game.

If you experience any performance issues, please note that Screeps is best played in Chrome browser.

Screeps is a game for programmers. If you don't know how to code in JavaScript, check out this free interactive course.

https://codecademy.com/learn/javascript


Let's begin. This is a playing field called a "room". In the real game, rooms are connected to each other with exits, but in the simulation mode only one room is available to you.

The object in the center of the screen is your first spawn, your colony center.

Documentation:
Game world

http://docs.screeps.com/introduction.html#Game-world


Your spawn creates new units called "creeps" by its method spawnCreep. Usage of this method is described in the documentation. Each creep has a name and certain body parts that give it various skills.

You can address your spawn by its name the following way: Game.spawns['Spawn1'].

Create a worker creep with the body array [WORK,CARRY,MOVE] and name Harvester1 (the name is important for the tutorial!). You can type the code in the console yourself or copy & paste the hint below.
Documentation:
Your colony
Creeps
Game object
StructureSpawn.spawnCreep

Game.spawns['Spawn1'].spawnCreep( [WORK, CARRY, MOVE], 'Harvester1' );

http://docs.screeps.com/
http://docs.screeps.com/introduction.html#Your-colony
http://docs.screeps.com/creeps.html
http://docs.screeps.com/global-objects.html#Game-object
http://docs.screeps.com/api/#StructureSpawn.spawnCreep


Here you can write scripts that will run on a permanent basis, each game tick in a loop. It allows writing constantly working programs to control behaviour of your creeps which will work even while you are offline (in the real game only, not the Simulation Room mode).

To commit a script to the game so it can run, use this button or Ctrl+Enter.

The code for each Tutorial section is created in its own branch. You can view code from these branches for further use in your scripts.

Documentation:
Scripting basics

http://docs.screeps.com/scripting-basics.html


To send a creep to harvest energy, you need to use the methods described in the documentation section below. Commands will be passed each game tick. The harvest method requires that the energy source is adjacent to the creep.

You give orders to a creep by its name this way: Game.creeps['Harvester1']. Use the FIND_SOURCES constant as an argument to the Room.find method.

Send your creep to harvest energy by typing code in the "Script" tab.
Documentation:
Game.creeps
RoomObject.room
Room.find
Creep.moveTo
Creep.harvest

module.exports.loop = function () {
    var creep = Game.creeps['Harvester1'];
    var sources = creep.room.find(FIND_SOURCES);
    if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
        creep.moveTo(sources[0]);
    }
}

http://docs.screeps.com/api/#Game.creeps
http://docs.screeps.com/api/#RoomObject.room
http://docs.screeps.com/api/#Room.find
http://docs.screeps.com/api/#Creep.moveTo
http://docs.screeps.com/api/#Creep.harvest


To make the creep transfer energy back to the spawn, you need to use the method Creep.transfer. However, remember that it should be done when the creep is next to the spawn, so the creep needs to walk back.

If you modify the code by adding the check .store.getFreeCapacity() > 0 to the creep, it will be able to go back and forth on its own, giving energy to the spawn and returning to the source.

Extend the creep program so that it can transfer harvested energy to the spawn and return back to work.
Documentation:
Creep.transfer
Creep.store

 Code
module.exports.loop = function () {
    var creep = Game.creeps['Harvester1'];

    if(creep.store.getFreeCapacity() > 0) {
        var sources = creep.room.find(FIND_SOURCES);
        if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
            creep.moveTo(sources[0]);
        }
    }
    else {
        if( creep.transfer(Game.spawns['Spawn1'], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE ) {
            creep.moveTo(Game.spawns['Spawn1']);
        }
    }
}

http://docs.screeps.com/api/#Creep.transfer
http://docs.screeps.com/api/#Creep.store


Great! This creep will now work as a harvester until it dies. Remember that almost any creep has a life cycle of 1500 game ticks, then it "ages" and dies (this behavior is disabled in the Tutorial).

Let's create another worker creep to help the first one. It will cost another 200 energy units, so you may need to wait until your harvester collects enough energy. The spawnCreep method will return an error code ERR_NOT_ENOUGH_ENERGY (-6) until then.

Remember: to execute code once just type it in the "Console" tab.

Spawn a second creep with the body [WORK,CARRY,MOVE] and name Harvester2.
Documentation:
StructureSpawn.spawnCreep
http://docs.screeps.com/api/#StructureSpawn.spawnCreep

Game.spawns['Spawn1'].spawnCreep( [WORK, CARRY, MOVE], 'Harvester2' );


The second creep is ready, but it won't move until we include it into the program.

To set the behavior of both creeps we could just duplicate the entire script for the second one, but it's much better to use the for loop against all the screeps in Game.creeps.

Expand your program to both the creeps.
Documentation:
JavaScript Reference: for...in loops
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in

module.exports.loop = function () {
    for(var name in Game.creeps) {
        var creep = Game.creeps[name];

        if(creep.store.getFreeCapacity() > 0) {
            var sources = creep.room.find(FIND_SOURCES);
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0]);
            }
        }
        else {
            if(creep.transfer(Game.spawns['Spawn1'], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(Game.spawns['Spawn1']);
            }
        }
    }
}


Now let's improve our code by taking the workers' behavior out into a separate module. Create a module called role.harvester with the help of the Modules section on the left of the script editor and define a run function inside the module.exports object, containing the creep behavior.

Create a role.harvester module.
Documentation:
Organizing scripts using modules
http://docs.screeps.com/modules.html

var roleHarvester = {

    /** @param {Creep} creep **/
    run: function(creep) {
	    if(creep.store.getFreeCapacity() > 0) {
            var sources = creep.room.find(FIND_SOURCES);
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0]);
            }
        }
        else {
            if(creep.transfer(Game.spawns['Spawn1'], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(Game.spawns['Spawn1']);
            }
        }
	}
};

module.exports = roleHarvester;


Now you can rewrite the main module code, leaving only the loop and a call to your new module by the method require('role.harvester').

Include the role.harvester module in the main module.

var roleHarvester = require('role.harvester');

module.exports.loop = function () {

    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        roleHarvester.run(creep);
    }
}

Training 1
Game.spawns['Spawn1'].spawnCreep( [WORK, WORK, WORK], 'Harvester1', {directions: [TOP_RIGHT]} );

2. Upgrading controller











3. Building structures
4. Auto-spawning creeps
5. Defending your room