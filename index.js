const sdk = require('cue-sdk');
const { GlobalKeyboardListener } = require("node-global-key-listener");
const fs = require("fs");

const kbl = new GlobalKeyboardListener();
const keymap = JSON.parse(fs.readFileSync("keys_firstmap.json", "ascii"));
const reverseKeymap = {};
const WHITE = { r: 255, g: 255, b: 255, a: 255 };
const BLUE = { r: 0, g: 0, b: 255, a: 255 };
const GREEN = { r: 0, g: 255, b: 0, a: 255 };
const RED = { r: 255, g: 0, b: 0, a: 255 };
const BLACK = {r:0,g:0,b:0,a:255};
const ORANGE = {r:255,g:128,b:0,a:255};

const TIMER_KEYS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"];
const COMBO_KEYS = ["F12","F11","F10","F9"];
const MAX_TIME = 30 * 60;

const moleColors = ["r","g","b"];
const COLOR_ORDER = [RED,BLUE,ORANGE,GREEN];

let boardLeds;
let numpadLeds;

const bigNumbers = {
    0:[
        105,
        106,
        107,
        108,
        109,
        112,
        113,
        116,
        122,
        121,
        120
    ],
    1:[
        108,
        112,
        120
    ],
    2:[
        105,
        106,
        107,
        111,
        114,
        116,
        121,
        122
    ],
    3:[
        105,
        106,
        107,
        108,
        112,
        120,
        121,
        108,
        113,
        114,
        115,
        122
    ],
    4:[
        108,
        112,
        120,
        105,
        109,
        113,
        114,
        115
    ],
    5:[
        105,
        106,
        107,
        109,
        114,
        118,
        121,
        122
    ],
    6:[
        105,
        106,
        107,
        109,
        113,
        114,
        115,
        116,
        118,
        121,
        122
    ],
    7:[
        105,
        106,
        107,
        108,
        112,
        120
    ],
    8:[
        105,
        106,
        107,
        109,
        111,
        113,
        115,
        116,
        118,
        114,
        121,
        122
    ],
    9:[
        105,
        106,
        107,
        111,
        109,
        113,
        114,
        115,
        118,
        121,
        122
    ]
};

for(let key in keymap){
    reverseKeymap[keymap[key][0]] = key;
}


function newMoles(count){
    let color = moleColors[Math.floor(Math.random()*moleColors.length)];
    let availableLeds = [...boardLeds].filter((led)=>{return !(led.id in gameState.moleKeyMap);})
    for(let i = 0; i < count; i++){
        let keyId = availableLeds[Math.floor(Math.random()*availableLeds.length)].id;
        let mole = {
            key:keyId,
            keyName:reverseKeymap[keyId],
            mainColor:color,
            currentColor:BLACK,
            progress:0,
            dying:false
        };
        // console.log(`Adding new ${mole.mainColor} mole on key ${mole.keyName}`);
        gameState.moles.push(mole);
        gameState.moleKeyMap[keyId] = mole;
    }
}

function incrementMole(moleIndex){
    let mole = gameState.moles[moleIndex];
    const MOLE_EMERGE_TIME = 40;
    const MOLE_SINGLE_FLASH_TIME = 5;
    const MOLE_TOTAL_FLASH_TIME = 30;
    const MOLE_DIE_TIME = 15;
    const MOLE_DYING_FLASH_TIME=2;
    mole.progress++;
    mole.currentColor = {...mole.currentColor};
    if(mole.dying){
        if(mole.progress < MOLE_DIE_TIME){
            mole.currentColor[mole.mainColor] = Math.floor(mole.progress / MOLE_DYING_FLASH_TIME)%2 == 0 ? 255: 0;
        }else{
            mole.currentColor = BLACK;
            delete gameState.moleKeyMap[mole.key];
            gameState.moles.splice(moleIndex,1);
        }
    }else{
        if(mole.progress < MOLE_EMERGE_TIME){
            mole.currentColor[mole.mainColor] = (mole.progress/MOLE_EMERGE_TIME)*255;
        }else if(mole.progress < MOLE_EMERGE_TIME + MOLE_TOTAL_FLASH_TIME){
            let stageProgress = mole.progress - MOLE_EMERGE_TIME;
            mole.currentColor[mole.mainColor] = Math.floor(stageProgress / MOLE_SINGLE_FLASH_TIME)%2 == 0 ? 255: 0;
        }else{
            mole.currentColor = BLACK;
            delete gameState.moleKeyMap[mole.key];
            gameState.moles.splice(moleIndex,1);
        }
    }
}

function updateMoles(){
    for(let i = gameState.moles.length-1; i >= 0; i--){
        incrementMole(i);
    }
    for(let i = 0; i < gameState.moles.length; i++){
        let mole = gameState.moles[i];
        // console.log("Setting mole",mole.key,"to",mole.currentColor);
        setLedColorById(mole.key,mole.currentColor);
    }
}

const MAX_MOLE_SPAWN_COOLDOWN=40;
const MIN_MOLE_SPAWN_COOLDOWN=0;
const MAX_MOLES = 3;
const DIGIT_CHANGE_MAX_COOLDOWN = 30;

let gameState = {
    state: "over",
    framesLeft: MAX_TIME,
    moles: [],
    moleKeyMap:{},
    moleSpawnCooldown: 0,
    score: 0,
    comboColor:"none",
    comboCount:0,
    digitChangeCooldown:DIGIT_CHANGE_MAX_COOLDOWN,
    digitIndex:0
};

// console.log(keymap);

let leds = {};
let device;

//Given the name of a key, returns the LED
function ledId(keyName) {
    if (!(keyName in keymap)) {
        return -1;
    }
    //Ignore possibility of multiple keys for now.
    return keymap[keyName][0];
}

function setLedColor(keyname, color) {
    let id = ledId(keyname);
    if (id == -1) {
        return false;
    }
    leds[id].r = color.r;
    leds[id].g = color.g;
    leds[id].b = color.b;
    leds[id].a = ("a" in color) ? color.a : 255;
    return true;
}

function setLedColorById(id, color) {
    leds[id].r = color.r;
    leds[id].g = color.g;
    leds[id].b = color.b;
    leds[id].a = ("a" in color) ? color.a : 1;
}

function setLedsInRange(xStart, yStart, xEnd, yEnd, color) {
    for (const id in leds) {
        // console.log(leds[id]);
        if (leds[id].x >= xStart && leds[id].x <= xEnd && leds[id].y >= yStart && leds[id].y <= yEnd) {
            // console.log(id,"in range");
            setLedColorById(id, color);
        }
    }
}

function getLedsInRange(xStart, yStart, xEnd, yEnd) {
    let output = [];
    for (const id in leds) {
        // console.log(leds[id]);
        if (leds[id].x >= xStart && leds[id].x <= xEnd && leds[id].y >= yStart && leds[id].y <= yEnd) {
            // console.log(id,"in range");
            output.push(leds[id]);
        }
    }
    return output;
}

function setLedGroup(group, color) {
    for (let i = 0; i < group.length; i++) {
        if(typeof group[i] == "object"){
            setLedColorById(group[i].id, color);
        }else if(typeof group[i] == "number"){
            setLedColorById(group[i],color);
        }else if(typeof group[i] == "string"){
            setLedColor(group[i],color);
        }
    }
}

//Assumes you only have one corsair device connected and it's a keyboard
function getAvailableLeds() {
    const availableLeds = [];
    const { error, data: devices } = sdk.CorsairGetDevices({
        deviceTypeMask: sdk.CorsairDeviceType.CDT_Keyboard
    });
    if (error != sdk.CorsairError.CE_Success) {
        console.log("Could not connect");
        return availableLeds;
    }
    if (devices.length == 0) {
        console.log("Error! No keyboard detected.");
    }
    const result = sdk.CorsairGetLedPositions(devices[0].id);
    const ledPositions = result.data;
    device = devices[0].id;
    // console.log("positions",ledPositions);
    for (let i = 0; i < ledPositions.length; i++) {
        leds[ledPositions[i].id] = {
            id: ledPositions[i].id,
            r: 0, g: 0, b: 0, a: 255, x: ledPositions[i].cx, y: ledPositions[i].cy
        };
    }
}

kbl.addListener((e, down) => {
    //TODO: Determine if this is the first frame it's down rather than if it's just currently held.
    if (e.state == "DOWN") {
        if(gameState.state=="whacking"){
            // console.log(e.name);
            let anyMatched = false;
            for(let i = gameState.moles.length-1; i >= 0; i--){
                if(!gameState.moles[i].dying && gameState.moles[i].keyName==e.name){
                    let oldComboColor = gameState.comboColor;
                    gameState.comboColor = gameState.moles[i].mainColor;
                    if(gameState.comboColor == oldComboColor){
                        gameState.comboCount++;
                    }else{
                        gameState.comboCount=0;
                    }
                    gameState.score+=Math.min(3,gameState.comboCount+1);
                    gameState.moles[i].dying = true;
                    gameState.moles[i].progress = 0;
                    // delete gameState.moleKeyMap[gameState.moles[i].key];
                    // gameState.moles.splice(i,1);
                    anyMatched=true;
                    break;
                }
            }
            if(!anyMatched){
                gameState.comboColor="none";
                gameState.comboCount=0;
            }
        }else if(gameState.state=="over"){
            if(e.name=="SPACE"){
                setLedsInRange(0, 0, 400, 400, BLACK);
                gameState = {
                    state: "whacking",
                    framesLeft: MAX_TIME,
                    moles: [],
                    moleKeyMap:{},
                    moleSpawnCooldown: 0,
                    score: 0,
                    comboColor:"none",
                    comboCount:0,
                    digitChangeCooldown:DIGIT_CHANGE_MAX_COOLDOWN,
                    digitIndex:0
                };
            }
        }
    }
});

function updateLeds() {
    let values = [];
    for (const i in leds) {
        values.push({
            id: leds[i].id,
            r: leds[i].r,
            g: leds[i].g,
            b: leds[i].b,
            a: leds[i].a
        });
    }
    // console.log(device,values);
    sdk.CorsairSetLedColors(device, values);
}

function updateComboCount(){
    if(gameState.comboColor=="green"){
        return;
    }
    for(let i = 0; i < COMBO_KEYS.length; i++){
        let color = {...BLACK};
        if(i <= gameState.comboCount){
            color[gameState.comboColor] = 255;
        }
        setLedColor(COMBO_KEYS[i],color);
    }
}

function updateTimer() {
    for (let i = 0; i < TIMER_KEYS.length; i++) {
        let oneTimeSegment = MAX_TIME / TIMER_KEYS.length;
        let value;
        if (gameState.framesLeft > oneTimeSegment * i && gameState.framesLeft < oneTimeSegment * (i + 1)) {
            value = (gameState.framesLeft - oneTimeSegment * i) / oneTimeSegment;
        } else if (gameState.framesLeft > oneTimeSegment * i) {
            value = 1;
        } else {
            value = 0;
        }
        // let value = Math.min(1,Math.max(oneTimeSegment*i/gameState.framesLeft,0));
        let color = { r: (1-value) * 255, g: 0, b: value * 255 };
        setLedColor(TIMER_KEYS[i], color);
    }
}

let mainRunning = false;
function main() {
    if (mainRunning) {
        return;
    }
    mainRunning = true;
    getAvailableLeds();
    boardLeds = getLedsInRange(0, 50, 325, 140);
    numpadLeds = getLedsInRange(400,0,600,400);
    newMoles(1);
    let interval = setInterval(() => {
        if (gameState.state == "whacking") {
            // console.log("Entering interval");
            setLedGroup(boardLeds, WHITE);
            // setLedGroup(boardLeds, BLACK);

            updateTimer();
            updateMoles();
            updateComboCount();

            gameState.framesLeft--;
            if (gameState.framesLeft <= 0) {
                console.log(`Game over! Your score was ${gameState.score}.`);
                gameState.state = "over";
            }

            gameState.moleSpawnCooldown--;
            if(gameState.moleSpawnCooldown<=0){
                let moleCount = Math.floor(Math.random()*MAX_MOLES)+1;
                newMoles(moleCount);
                gameState.moleSpawnCooldown = Math.floor(Math.random()*(MAX_MOLE_SPAWN_COOLDOWN-MIN_MOLE_SPAWN_COOLDOWN))+MIN_MOLE_SPAWN_COOLDOWN;
            }

        } else if (gameState.state == "over") {
            setLedsInRange(0, 0, 400, 400, RED);
            setLedColor("SPACE",BLUE);
        }

        //Update score
        setLedGroup(numpadLeds,WHITE);
        let number = `${gameState.score}`[gameState.digitIndex];
        setLedGroup(bigNumbers[number],COLOR_ORDER[gameState.digitIndex%COLOR_ORDER.length]);
        gameState.digitChangeCooldown--;
        if(gameState.digitChangeCooldown<=0){
            gameState.digitChangeCooldown = DIGIT_CHANGE_MAX_COOLDOWN;
            gameState.digitIndex++;
            if(gameState.digitIndex >= `${gameState.score}`.length){
                gameState.digitIndex=0;
            }
        }


        updateLeds();
        // console.log(gameState.framesLeft/30);
    }, 1000 / 30);
}

sdk.CorsairConnect(evt => {
    console.log(sdk.CorsairSessionStateToString(evt.data.state));
    if (evt.data.state == sdk.CorsairSessionState.CSS_Connected) {
        main();
    }
});

/*
    TODO:
        Scoring system

*/