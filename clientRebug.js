(function () {
    /*global require,console*/
    'use strict';

    var request = require('request');
    var EasyStar = require('easystarjs');
    var Player = { name : 'rebug-' + parseInt(Math.random() * 100, 10) };
    var BASE_URL = 'http://localhost:3000';
    var UP_STRING = "up";
    var RIGHT_STRING = "right";
    var DOWN_STRING = "down";
    var LEFT_STRING = "left";
    var isClimbing = false;
    var treasureLocationInMap = false;
    var bestRoute = [];
    // movement in order of this array
    var directions = [
                {string: UP_STRING, dirVector: {x: 0, y: -1}},
                {string: LEFT_STRING, dirVector: {x: -1, y: 0}},
                {string: DOWN_STRING, dirVector: {x: 0, y: 1}},
                {string: RIGHT_STRING, dirVector: {x: 1, y: 0}}
            ];
    // starting with up
    var directionIndex = 0;
    var startJourneyHome = true;
    var easystar = new EasyStar.js();
    var home = {x: 0, y: 0};
    var treasure = {x: 0, y: 0};


    // hashmap to store grid
    function Map(highX, lowX, highY, lowY) {
        var contents = {};
        this.highX = 0;
        this.lowX = 0;
        this.highY = 0;
        this.lowY = 0;
        function index (x, y) {
            return x + "," + y;
        }
        function set_map(x, y, tile, hasTreasure, visited) {
            contents[index(x, y)] = {tile: tile, hasTreasure: hasTreasure, visited: visited};
            if (x < this.lowX) {
                //(console.log('lowering x to ' + x);
                this.lowX = x;
            }
            if (x > this.highX) {
                //console.log('upping x to ' + x);
                this.highX = x;
            }
            if (y < this.lowY) {
                //console.log('lowering y to ' + y);
                this.lowY = y;
            }
            if (y > this.highY) {
                //console.log('upping y to ' + y);
                this.highY = y;
            }
        }
        function get_map(x, y) {
            return contents[index(x, y)];
        }
        return {get: get_map, set: set_map, highX: highX, lowX: lowX, lowY: lowY, highY: highY};
    }
    var map = new Map(0, 0, 0, 0);

    // 
    function setVisitedOptional(pos, xNow, yNow) {
        var setVisitedTo = false;
        // is known
        if (typeof(map.get(xNow, yNow)) !== "undefined") {
            // is visited
            // or we are there right now
            if (map.get(xNow, yNow).visited || (pos.x === xNow && pos.y === yNow)) {
                setVisitedTo = true;
            }
        }
        return setVisitedTo;
    }

    function updateMap(map, pos, data) {
        // forest
        // data.length === 3
        // get centertile with data.length - 2 
        // grass
        // data.length === 5
        // get centertile with data.length - 3
        // mountain
        // data.length === 7
        // get centertile with data.length - 4
        // view will be read from top left to bottom right
        // calculate the offset
        /*
        i.e. first row on forest
        [{x: -1,y: -1}, {x: 0,y: -1}, {x: 1,y: -1}],

        i.e. first row on grass
        [{x: -2,y: -2}, {x: -1,y: -2}, {x: 0,y: -2}, {x: 1,y: -2}, {x: 2,y: -2}],
        */
        var offset = 0;
        if (data.view.length === 3) {
            offset = 1;
        } else if (data.view.length === 5) {
            offset = 2;
        } else if (data.view.length === 7) {
            offset = 3;
        }
        var y = pos.y;
        var x = pos.x;
        for (var i = 0; i < data.view.length; i++) {
            y = pos.y + i - offset;
            for (var j = 0; j < data.view.length; j++) {
                x = pos.x + j - offset;
                map.set(x,
                        y,
                        data.view[i][j],
                        treasureOnTile(data.view[i][j]),
                        setVisitedOptional(pos, x, y));
                if (treasureOnTile(data.view[i][j])) {
                    treasureLocationInMap = {x: x, y: y};
                }
            }
        }
        return map;
    }

    function treasureOnTile(tile) {
        var hasTreasure = false;
        if (tile.hasOwnProperty('treasure')) {
            if (tile.treasure) {
                hasTreasure = true;
            }
        }
        return hasTreasure;
    }


    function takeTurn (pos, search, data) {
        if (!isClimbing) {
            console.log(pos);
            updateMap(map, pos, data);
            drawMap();
        } else {
            console.log('climbing, not updating map and pos');
        }
        var dir = search ? nextSearchStep(pos) : nextHomeStep(pos);
        move(dir, function (data) {
            // update position when moving to a new tile, i.e. after climbing
            pos = updatePos(pos);
            takeTurn(pos, !data.treasure, data);
        });
    }

    // helper init array
    // usage array(2, 2)
    // [new Array(2), new Array(2)]
    function createArray(length) {
        var arr = new Array(length || 0),
            i = length;

        if (arguments.length > 1) {
            var args = Array.prototype.slice.call(arguments, 1);
            while(i--) arr[length-1 - i] = createArray.apply(this, args);
        }

        return arr;
    }

    function drawMap () {
        var xRange = map.lowX * (-1) + map.highX + 1;
        var yRange = map.lowY * (-1) + map.highY + 1;
        // init grid
        var grid = createArray(yRange, xRange);
        console.log('saved map: ');
        var logstr = '';
        for (var y=map.lowY, i = 0; y <= map.highY; y++, i++) {
            logstr = '';
            for (var x=map.lowX, j = 0; x <= map.highX; x++, j++) {
                var mapEntry = map.get(x, y);
                if(typeof(mapEntry) === "undefined") {
                    // unknown mapEntry
                    logstr += '# ';
                    // not walkable
                    grid[i][j] = 0;
                } else {
                    // C or first character of type
                    if (mapEntry.tile.hasOwnProperty("castle")) {
                        if (mapEntry.tile.castle === Player.name) {
                            logstr += 'H ';
                            grid[i][j] = mapEntry.tile.type === "mountain" ? 2 : 1;
                            home.x = j;
                            home.y = i;
                        } else {
                            logstr += 'C ';
                            // not walkable
                            grid[i][j] = 0;
                        }
                    } else {
                        logstr += mapEntry.tile.type[0] + ' ';
                        if (mapEntry.tile.type === "water") {
                            // not walkable
                            grid[i][j] = 0;
                        } else if (mapEntry.tile.type === "mountain") {
                            grid[i][j] = 2;
                            easystar.setAdditionalPointCost(x, y, 1);
                        } else {
                            grid[i][j] = 1;
                        }
                    }
                }
            }
            console.log(logstr);
        }
        console.log('\n');
        return grid;
    }

    function nextHomeStep (pos) {
        if (startJourneyHome) {
            startJourneyHome = false;
            // drawMap();
            // home easystar
            console.log('lets go home');
            var homeMap = drawMap();
            easystar.setGrid(homeMap);
            easystar.setAcceptableTiles([1,2]);
            // set to synchronos
            easystar.enableSync();
            console.log("pos");
            console.log(pos.x);
            console.log(pos.y);
            console.log("low");
            console.log(map.lowX);
            console.log(map.lowY);
            console.log("high");
            console.log(map.highX);
            console.log(map.highY);
            console.log("home");
            console.log(home.x);
            console.log(home.y);
            console.log("treasureLocationInMap");
            console.log(treasureLocationInMap.x);
            console.log(treasureLocationInMap.y);
            console.log("treasureLocationInMap final");
            console.log(treasureLocationInMap.x - map.lowX);
            console.log(treasureLocationInMap.y - map.lowY);
            console.log("homeMap: ");
            console.log(homeMap);
            var posOnFinalMap = {x: pos.x - map.lowX, y: pos.y - map.lowY};
            easystar.findPath(posOnFinalMap.x, posOnFinalMap.y, home.x, home.y, function( path ) {
                if (path === null) {
                    console.log("Path was not found.");
                } else {
                    console.log('home: ' + home.x + ',' + home.y);
                    console.log('posOnFinalMap: ' + posOnFinalMap.x + ',' + posOnFinalMap.y);
                    // console.log("path: ");
                    // console.log(path);
                    console.log("Path was found. The first Point is " + path[0].x + " " + path[0].y);
                    // write path to bestRoute
                    // resolve coords to directions
                    // compare pos to new coords
                    // get vector
                    // get direction
                    var retDir = DOWN_STRING;
                    var tempPos = {x: posOnFinalMap.x, y: posOnFinalMap.y};
                    // clear bestRoute
                    bestRoute = [];
                    // start at 1 -> 0 is startpoint
                    for (var i = 1; i < path.length; i++) {
                        if (path[i].x > tempPos.x) {
                            retDir = RIGHT_STRING;
                            // update temp pos
                            tempPos = {x: tempPos.x + 1, y: tempPos.y};
                        } else if (path[i].x < tempPos.x) {
                            retDir = LEFT_STRING;
                            // update temp pos
                            tempPos = {x: tempPos.x - 1, y: tempPos.y};
                        } else if (path[i].y < tempPos.y) {
                            retDir = UP_STRING;
                            // update temp pos
                            tempPos = {x: tempPos.x, y: tempPos.y - 1};
                        } else {
                            // update temp pos
                            retDir = DOWN_STRING;
                            tempPos = {x: tempPos.x, y: tempPos.y + 1};
                        }
                        if (homeMap[path[i].y][path[i].x] === 2) {
                            //console.log('extra climbing step at: ' + tempPos.x +','+tempPos.y);
                            bestRoute.push(retDir);
                        }
                        bestRoute.push(retDir);
                    }
                }
                console.log('homepath: ');
                console.log(path);
                console.log(bestRoute);
                bestRoute.reverse();
            });
            easystar.calculate();
        }
        return bestRoute.pop();
    }

    function updatePos (pos) {
        // return updated position
        var retPosition = { x: pos.x + directions[directionIndex].dirVector.x, y: pos.y + directions[directionIndex].dirVector.y};
        // first step on mountain is climbing
        // if (isClimbing) {
        //     // do not update pos
        //     retPosition = { x: pos.x, y: pos.y};
        //     // reset climbing
        //     isClimbing = false;
        // } else {
        //     // check if next move will be a mountain
        //     if (map.get(pos.x + directions[directionIndex].dirVector.x, pos.y + directions[directionIndex].dirVector.y).tile.type === "mountain") {
        //         // console.log('start climbing');
        //         isClimbing = true;
        //     }
        // }
        var nextIsMountain = map.get(pos.x + directions[directionIndex].dirVector.x, pos.y + directions[directionIndex].dirVector.y).tile.type === "mountain";
        // next move mountain?
        // and climbing
        if(nextIsMountain && isClimbing) {
            // reset climbing
            isClimbing = false;
        // next move is not mountain
        } else if (nextIsMountain) {
            // do not update pos
            retPosition = {x: pos.x, y: pos.y};
            isClimbing = true;
        }
        return retPosition;
    }

    function move (dir, cb) {
        request({
            uri    : BASE_URL + '/move/',
            method : 'POST',
            form   : {
                player    : Player.name,
                direction : dir
            }
        }, function (error, res, body) {
            var data = JSON.parse(body);
            printView(data.view);
            if (data.game) {
                console.log(Player.name, data);
                reset();
            } else {
                cb(data);
            }
        });
    }

    // turn
    function decrementIndexInArrayLoop(array, index) {
        // change direction and try again
        if (index > 0) {
            index--;
        } else {
            index = array.length - 1;
        }
        return index;
    }

    // turn otherway
    function incrementIndexInArrayLoop(array, index) {
        // change direction and try again
        if (index < array.length - 1) {
            index++;
        } else {
            index = 0;
        }
        return index;
    }

    function getTileForNextDirection(pos) {
        // change direction and try again
        directionIndex = incrementIndexInArrayLoop(directions, directionIndex);
        // update direction to check
        var tileToCheck = map.get(pos.x + directions[directionIndex].dirVector.x,
                            pos.y + directions[directionIndex].dirVector.y);
        // console.log('changing direction ...');
        return tileToCheck;
    }

    function nextSearchStep (pos) {
        // onward to glory! - set direction to forward
        var retDirection = directions[directionIndex].string;
        // treasure in sight?
        if (treasureLocationInMap) {
            if (bestRoute.length === 0) {
                console.log('treasure in sight!');
                var treasureMap = drawMap();
                easystar.setGrid(treasureMap);
                easystar.setAcceptableTiles([1,2]);
                // set to synchronos
                easystar.enableSync();
                // console.log("pos");
                // console.log(pos.x);
                // console.log(pos.y);
                // console.log("low");
                // console.log(map.lowX);
                // console.log(map.lowY);
                // console.log("high");
                // console.log(map.highX);
                // console.log(map.highY);
                // console.log("home");
                // console.log(home.x);
                // console.log(home.y);
                // console.log("treasureLocationInMap");
                // console.log(treasureLocationInMap.x);
                // console.log(treasureLocationInMap.y);
                console.log("treasureLocationInMap final");
                console.log(treasureLocationInMap.x - map.lowX);
                console.log(treasureLocationInMap.y - map.lowY);
                // console.log("treasureMap: ");
                // console.log(treasureMap);
                var posOnFinalMap = {x: pos.x - map.lowX, y: pos.y - map.lowY};
                console.log("posOnFinalMap: ");
                console.log(posOnFinalMap.x);
                console.log(posOnFinalMap.y);
                easystar.findPath(posOnFinalMap.x, posOnFinalMap.y, treasureLocationInMap.x - map.lowX, treasureLocationInMap.y - map.lowY, function( path ) {
                    if (path === null) {
                        console.log("Path was not found.");
                    } else {
                        console.log("Path was found. The first Point is " + path[0].x + " " + path[0].y);
                        // write path to bestRoute
                        // resolve coords to directions
                        // compare pos to new coords
                        // get vector
                        // get direction
                        var retDir = DOWN_STRING;
                        var tempPos = {x: posOnFinalMap.x, y: posOnFinalMap.y};
                        // start at 1, 0 is startpoint
                        for (var i = 1; i < path.length; i++) {
                            if (path[i].x > tempPos.x) {
                                retDir = RIGHT_STRING;
                                // update temp pos
                                tempPos = {x: tempPos.x + 1, y: tempPos.y};
                            } else if (path[i].x < tempPos.x) {
                                retDir = LEFT_STRING;
                                // update temp pos
                                tempPos = {x: tempPos.x - 1, y: tempPos.y};
                            } else if (path[i].y < tempPos.y) {
                                retDir = UP_STRING;
                                // update temp pos
                                tempPos = {x: tempPos.x, y: tempPos.y - 1};
                            } else {
                                // update temp pos
                                retDir = DOWN_STRING;
                                tempPos = {x: tempPos.x, y: tempPos.y + 1};
                            }
                            // two steps for mountain
                            if (treasureMap[path[i].y][path[i].x] === 2) {
                                bestRoute.push(retDir);
                            }
                            bestRoute.push(retDir);
                        }
                    }
                    console.log('path to treasure:');
                    console.log(path);
                    // console.log('revert this:')
                    // console.log(bestRoute);
                    bestRoute.reverse();
                    // console.log(bestRoute);
                });
                easystar.calculate();

            }
            retDirection = bestRoute.pop();
            // update directonIndex
            for (var i = 0, len = directions.length; i < len; i++) {
                if (directions[i].string === retDirection) {
                    directionIndex = i;
                }
            }
        } else {
            // stick to climbing - its good for your health!
            if (!isClimbing) {
                directionIndex = decrementIndexInArrayLoop(directions, directionIndex);
            }
            // check if forward is possible
            // check if field has been visited
            console.log(pos.x);
            console.log(pos.y);
            console.log(directions[directionIndex]);
            var tileToCheck = map.get(pos.x + directions[directionIndex].dirVector.x,
                                    pos.y + directions[directionIndex].dirVector.y);
            // console.log('i check to go: ' + retDirection + ' thats: ' + (pos.x + directions[directionIndex].dirVector.x) + ','+ (pos.y + directions[directionIndex].dirVector.y));
            // console.log(tileToCheck.tile);
            for (var i = 0; i < directions.length && (!isMoveableField(tileToCheck.tile) || tileToCheck.visited); i++) {
                tileToCheck = getTileForNextDirection(pos);
            }
            // dead end prevention
            if (!isMoveableField(tileToCheck.tile)) {
                //console.log('no way out - at least i wont die');
                for (var j = 0; j < directions.length && (!isMoveableField(tileToCheck.tile)); j++) {
                    tileToCheck = getTileForNextDirection(pos);
                }
            }
            retDirection = directions[directionIndex].string;
            // console.log('i will go: ' + retDirection + ' thats: ' + (pos.x + directions[directionIndex].dirVector.x) + ','+ (pos.y + directions[directionIndex].dirVector.y));
            // console.log(tileToCheck.tile);
        }
        return retDirection;
    }

    /**
    * check if a given tile can entered without being killed
    * bad things happen at type: "water", and castle: [playername]
    */
    function isMoveableField (tile) {
        var iWillSurvive = false;
        if (tile.hasOwnProperty("type")) {
            if (tile.type !== "water") {
                iWillSurvive = true;
            }
        }
        if (tile.hasOwnProperty("castle")) {
            if (tile.castle === Player.name) {
                iWillSurvive = true;
            } else {
                iWillSurvive = false;
            }
        }
        return iWillSurvive;
    }

    function reset () {
        request({
            uri    : BASE_URL + '/reset/',
            method : 'GET',
        }, function () {});
    }

    function printView (data) {
        if (!data || !data.length) return;
        console.log('view:');
        for (var y=0; y<data.length; y++) {
            var logstr = '';
            for (var x=0; x<data.length; x++) {
                logstr += data[y][x].castle ? 'C ' : data[y][x].type[0] + ' ';
            }
            console.log(logstr);
        }
        console.log('\n');
    }


    request({
        uri    : BASE_URL + '/register/',
        method : 'POST',
        form   : {
            name : Player.name
        }
    }, function (res, error, body) {
        var data = JSON.parse(body);
        var pos = { x:0, y:0 };
        // set startfiled
        map.set(pos.x,
        pos.y,
        {},
        false,
        true);
        updateMap(map, pos, data);
        // TODO first view has mountion (first move or second moven)
        // cannot read property of "tile" of undefined
        takeTurn(pos, true, data);
    });
}());
