const chalk = require('chalk');
const Room = require('./Room');
const Character = require('./Character');
const say = require('./util/say');
const output = require('./util/output');
const directions = require('./lang/directions');
const junkWords = require('./lang/junkWords');
const aliases = require('./lang/aliases');

function toArray(input) {
    return Array.isArray(input) ? input : [input];
}

function tryAction() {

}

function removeJunk(input) {
    const junkObj = {};
    for (let word of junkWords) {
        junkObj[word] = true;
    }
    return input.split(' ').filter(word => !junkObj[word]).join(' ');
}

function resolveAliases(input, aliases) {
    return input.split(' ').map(word => aliases[word] || word).join(' ');
}

function preprocessString(input, aliases) {
    input = input.toLowerCase().trim();
    input = input.replace(/\W+/g, ' ');
    input = removeJunk(input);
    input = input.replace(/\W+/g, ' '); // In case new spaces are added
    input = resolveAliases(input, aliases);
    input = input.replace(/\W+/g, ' '); // In case new spaces are added
    return input;
}

function tryAction(action, input, game, room) {
    const phrases = toArray(action.phrase);
    for (let phrase of phrases) {
        if (input === preprocessString(phrase, game.aliases)) {
            if (action.requiresThing) {
                const things = toArray(action.requiresThing);
                for (let thing of things) {
                    if (!game.self.has(thing)) {
                        say(`You don't have that.`);
                        return true;
                    }
                }
            }
            action.action(game, room);
            return true;
        }
    }
    return false;
}

module.exports = class Game {
    constructor(data) {
        this.rooms = {};
        for (let room of data.rooms) {
            this.rooms[room.name] = new Room(room);
        }
        
        this.startingRoom = data.startingRoom;
        this.prologue = data.prologue;
        this.name = data.name;
        
        this.room = this.rooms[this.startingRoom];
        this.self = new Character(this.room);
        this.onMoveCallbacks = [];
        this.aliases = {};
        this.prepareAliases(aliases);
        this.prepareAliases(data.aliases);
        
        this.validateDirections();
    }
    
    start() {
        output(this.name, 'title');
        output(this.prologue);
    }
    
    onMove(action) {
        this.onMoveCallbacks.push(action);
    }

    validateDirections() {
        for (let room of Object.values(this.rooms)) {
            if (room.exits) {
                let exits = Object.values(room.exits);
                for (let exit of exits) {
                    if (!this.rooms[exit.room]) {
                       throw(chalk.red(`Error! Room: ${room.name} has an exit to a nonexistent room ${exit.room}`));
                    }
                }
            } 
        }
    }

    prepareAliases(data) {
        if (!data) {
            return;
        }
        for (let root of Object.keys(data)) {
            let aliases = toArray(data[root]);
            for (let alias of aliases) {
                this.aliases[alias] = root;
            }
        }
    }

    goToRoom(roomName) {
        this.room = this.rooms[roomName];
        this.self.room = this.room;
    }

    parseInput(input, room) {
        input = preprocessString(input, this.aliases);

        let exits = Object.values(room.exits);
        if (!exits || exits.length === 0) {
            say('You are trapped!');
            return;
        }
        for (let exit of exits) {
            if (!exit.blocked && (input === exit.dir || input === directions.fullname(exit.dir))) {
                this.room = this.rooms[exit.room];
                this.self.room = this.room;
                for (let action of this.onMoveCallbacks) {
                    action(this, this.room);
                }
                for (let action of this.room.onEnter) {
                    action(this, this.room);
                }
                return;
            }
        }
        for (let action of (room.actions || [])) {
            if (tryAction(action, input, this, room)) {
                return;
            }
        }
        
        for (let thing of Object.values(this.self.inventory)) {
            for (let action of (thing.actions || [])) {
                if (tryAction(action, input, this, room)) {
                    return;
                }
            }
        }

        if (input === 'i' || input === 'inventory') {
            this.self.reportInventory();
            return;
        }

        const words = input.split(' ');
        if (words[0] === 'take') {
            for (let thing of room.things) {
                if (thing.name === words[1]) {
                    if (!thing.gettable) {
                        say(`You can't take the ${thing.name}.`);
                        return;
                    }
                    this.self.take(thing);
                    return;
                }
            }
            say(`You can't take that.`);
            return;
        }
        if (words[0] === 'drop') {
            for (let thing of Object.values(this.self.inventory)) {
                if (thing.name === words[1]) {
                    this.self.drop(thing);
                    return;
                }
            }
            say(`You have no ${words[1]}.`);
            return;
        }

        say("You can't do that.");
    }
    
};