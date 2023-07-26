let aFile = document.querySelector('#mymusic');
let aTitle = document.querySelector('#played-title');
let songDuration = 0;
let playerThumb = document.querySelector('#player-thumb');
playerThumb.offset = 0;
playerThumb.position = 0;




let playerThumbTime = document.querySelector('#thumb-time');

let borderDragOn = false;

// Volume slider elements
let volumeSliderThumb = document.querySelector('#volume-slider-thumb');
const volumeDefaultLevel = 0.5;
volumeSliderThumb.position = volumeDefaultLevel;
volumeSliderThumb.maxValue = 1;
volumeSliderThumb.offset = 1;



const LARGE_SCALE = 2;
const MIDDLE_SCALE = 1;
const PRECISE_SCALE = 0;


let volumeSliderTrack = document.querySelector('#volume-slider-track');


let playerBottomMenuWrapper = document.querySelector('#player-bottom-menu-wrapper');
let volumeBTN = document.querySelector('#volume-svg-btn');
let volumeOffBTN = document.querySelector('#volume-svg-btn-off');
let volumeSlider = document.querySelector('#volume-slider-track');
let bordersBTN = document.querySelector('#border-svg-btn');

let progressBarLine = document.querySelector('#player-progress-bar-track');
let progressBarLineSpan = progressBarLine.getBoundingClientRect().width;

let borderLeft = document.querySelector('#range-border-wrapper-left');
borderLeft.offset = 0;
let leftPointer = document.querySelector('#range-border-pointer-left');
let borderRight = document.querySelector('#range-border-wrapper-right');
borderRight.offset = 2;
let rightPointer = document.querySelector('#range-border-pointer-right');
let ruler = document.querySelector("#progress-bar-ruler");
let rulerCompStyle = getComputedStyle(ruler);
ruler.pointerOriginX = undefined;


let longBarTemplate = document.querySelector('#long-bar-template');
let shortBarTemplate = document.querySelector('#short-bar-template');
let middleBarTemplate = document.querySelector('#middle-bar-template');

  

let rangeBox = document.querySelector('#range-box');
let leftLine = document.querySelector('#border-line-left');
let leftLineStyles = getComputedStyle(leftLine);
leftLine.style.left = leftLineStyles.left;
let rightLine = document.querySelector('#border-line-right');
let rightLineStyles  = getComputedStyle(rightLine);


bordersBTNisOn = 0; // 0 - off; 1 - on
bordersBTN.style.stroke = "black";
borderLeft.style.visibility = "hidden";
borderRight.style.visibility = "hidden";
rangeBox.style.visibility = "hidden";


volumeSlider.style.display = 'none';

let playBTN = document.querySelector('#bottom-menu-player-btn');

let playerWrapper = document.querySelector('.player');
let stopBTN = document.querySelector('#stop-svg-btn');

let songName = '';

let volumeSliderOn = false;

let startPlayAt = 0;
let durationRounded = 0;
let playTime = document.querySelector('#player-time');
let intervalsId = 0;


// SEGMENT: Read audio file data from DB
let audioFileID = localStorage.getItem('aFileID');
let openDB = indexedDB.open("audioBase", 1);



openDB.onsuccess = (e) => {
    let db = e.target.result;
    let transAct = db.transaction('audio', 'readonly');
    let trasactionStore = transAct.objectStore('audio');
    let aFileRequest = trasactionStore.get(Number(audioFileID));
    
    aFileRequest.onsuccess = (e) => {
        let reQ = e.target;
        let reQres = reQ.result;
        aFile.src = URL.createObjectURL(reQres.audioFile);
        songName = reQres.aName;
    }
    aFileRequest.onerror = (err) => {
        console.warn(err);
    }
}
openDB.onerror = (err) => {
    console.warn(err);
}

let aFileDataLoaded = aFile.addEventListener('loadedmetadata', function() {
    songDuration = aFile.duration;
    durationRounded = Math.round(songDuration);

    aTitle.textContent = songName;
    aTitle.style.transition = "all 18s";
    aTitle.style.marginLeft = `-${songName.length - 37}rem`;    
    setTimeout(function(){aTitle.style.marginLeft = "0rem"}, 18000);
    
    // playTime.textContent = `0 / ${durationRounded}`;

    // SEGMENT: Create Ruler
    durationRounded > 70 ? drawScale(LARGE_SCALE) : drawScale(MIDDLE_SCALE);


    ruler.left = ruler.offsetLeft;
    ruler.originalWidth = ruler.offsetWidth;

    // Move the first ruler notch to the very left
    // and the right ruler notch to the very right

    // appendChild in largeScale and smallScale functions
    // adds CarretReturn text node before child element
    // and therefore firstChild will refer to it
    // firstElementChild refers to div correctly
    

    // SEGMENT END: Create Ruler

    // Activate slider for volume
    volumeSlider.style.display = 'block';
    sliderMoveHandler(volumeSliderThumb, volumeSliderTrack, showMute);
    volumeSlider.style.display = 'none';

    playerThumb.maxValue = songDuration;
    sliderMoveHandler(playerThumb, progressBarLine, undefined, playerThumbTime, playerThumbTimeFormat);

    // Slider function execution after songDuration is determined
    borderLeft.maxValue = songDuration;
    sliderMoveHandler(borderLeft, progressBarLine, rangeLeftSelect, borderLeftTime, borderLeftTimeFormat);
    borderRightTime.textContent = durationRounded;
    borderRight.maxValue = songDuration;
    borderRight.position = borderRight.maxValue;
    borderRight.locked = false;
    sliderMoveHandler(borderRight, progressBarLine, rangeRightSelect, borderRightTime, borderRightTimeFormat);

})
// SEGMENT END: Read audio file data from DB


let currentTime = aFile.currentTime;

playBTN.addEventListener('click', () => {
    aFile.paused ? playLoops() : stopPlaying()});

// stopBTN.addEventListener('click', () => {
//     playerThumb.style.left = thumbInitialPosition - thumbOffset + 'px';
//     // playTime.textContent = `0 / ${durationRounded}`;
//     aFile.currentTime = 0;
//     stopPlaying();    
// })

volumeBTN.addEventListener('click', () => {
    if (volumeSlider.style.display == 'none') {
        volumeSlider.style.display = 'block';
    } else {
        volumeSlider.style.display = 'none';
    }
});

volumeOffBTN.addEventListener('click', () => {
    if (volumeSlider.style.display == 'none') {
        volumeSlider.style.display = 'block';
    } else {
        volumeSlider.style.display = 'none';
    }
});

bordersBTN.addEventListener('click', () => {
    if (!bordersBTNisOn) {
        bordersBTNisOn = 1; // Borders swiched on
        bordersBTN.style.stroke = "rgb(65, 105, 225)";
        moveNearestBorderToSliderThumbPosition();
        borderLeft.style.visibility = "visible";
        borderRight.style.visibility = "visible";
        rangeBox.style.visibility = "visible";
        playerThumb.style.visibility = "hidden";

    } else {
        bordersBTNisOn = 0;
        bordersBTN.style.stroke = "black";
        borderLeft.style.visibility = "hidden";
        borderRight.style.visibility = "hidden";
        rangeBox.style.visibility = "hidden";
        playerThumb.style.visibility = "visible";
    }

})

function moveNearestBorderToSliderThumbPosition() {

    let borderLeftDistance = Math.abs(playerThumb.position - borderLeft.position);
    let borderRightDistance = Math.abs(playerThumb.position - borderRight.position);
    let playerThumbMarginLeft = (playerThumb.position * progressBarLine.getBoundingClientRect().width) / playerThumb.maxValue;

    if (playerThumb.position == 0) return;
    if ((borderLeftDistance - borderRightDistance) < 0) {
        borderLeft.style.left = playerThumbMarginLeft + 'px';
        borderLeft.position = playerThumb.position;
        borderLeftTime.textContent = borderLeftTimeFormat(borderLeft.position);
        colorRange()

    } else {
        // borderRight has CSS property Left from align-items: flex-end.
        // if position borderRight via style.marginLeft, it will add up on Left property
        borderRight.style.left = (playerThumbMarginLeft - borderRight.getBoundingClientRect().width) + 'px';
        borderRight.position = playerThumb.position;
        borderRightTime.textContent = borderRightTimeFormat(borderRight.position);
        colorRange()
    }
    console.log("playerThumb.position: ", playerThumb.position, "borderLeft.position: ", borderLeft.position, "borderRight.position: ", borderRight.position);
}

// SEGMENT: ZOOM Slider

// Elements
let zoomThumb = document.querySelector('#zoom-thumb-svg-btn');
let zoomTrack = document.querySelector('#zoom-track');
zoomThumb.maxValue = 3;
zoomThumb.position = 0;
zoomThumb.offset = 1;

// Auxiliary function
function makeZoom() {
    let zoomInRatio = 1 + zoomThumb.position;
    progressBarLine.style.minWidth = (progressBarLineSpan * zoomInRatio) + 'px';
    ruler.style.minWidth = (progressBarLineSpan * zoomInRatio) + 'px';
    ruler.width = ruler.offsetWidth;
    progressBarLine.style.marginLeft = '0px';
    ruler.style.marginLeft = '0px';

    if (zoomThumb.position > 0) {
        ruler.style.background = "rgba(25, 25, 112, 0.3)";
        ruler.style.cursor = "pointer";
        drawScale(PRECISE_SCALE);
     } else {
        ruler.style.background = "none";
        ruler.style.cursor = "auto";
        durationRounded > 70 ? drawScale(LARGE_SCALE) : drawScale(MIDDLE_SCALE);
     }
    colorRange();
}

// Slider function execution
sliderMoveHandler(zoomThumb, zoomTrack, makeZoom);
// SEGMENT END: ZOOM Slider


// SEGMENT: Range Selection Border Left
// Elements
let borderLeftStyles = getComputedStyle(borderLeft);
borderLeft.left = '0px';
borderLeft.position = 0;
borderLeft.locked = false;
borderLeft.isActualLeftBorder = true;

// Auxiliary function
let borderLeftTime = document.querySelector('#left-border-time');
let timeStyles = getComputedStyle(borderLeftTime);
let borderLeftTimeFormat = function makeborderLeftTimeFormatString(trackPosition) {
    return `${Math.round(trackPosition)}`;
}

function playerThumbTimeFormat(trackPosition, maxValue) {
    return `${Math.round(trackPosition)}`;
}
// SEGMENT END: Range Selection Border Left

// SEGMENT: Range Selection Border Right
// Elements
let borderRightStyles = getComputedStyle(borderRight);
borderRight.left = borderRightStyles.left;

let borderRightTime = document.querySelector('#right-border-time');
let borderRightTimeFormat = function makeborderRightTimeFormatString(trackPosition) {
    return `${Math.round(trackPosition)}`;
}
// SEGMENT END: Range Selection Border Right

// SEGMENT Auxiliary functions for different sliders

function colorRange() {
    // rangeBox height is equal to range border height minus time field height, minus 5px of lock svg image

    rangeBox.style.height = (parseFloat(borderRightStyles.height) - parseFloat(timeStyles.height) - 6) + 'px';
    // rangeBox.style.height = (Number((borderRightStyles.height).replace('px','')) - (timeStyles.height).replace('px','') - 6) + 'px';
    rangeBox.style.left = borderLeft.isActualLeftBorder ? 
            (leftLine.getBoundingClientRect().x - progressBarLine.getBoundingClientRect().x) + 'px' :
            (rightLine.getBoundingClientRect().x - progressBarLine.getBoundingClientRect().x) + 'px';
    rangeBox.style.top = '0.55rem';
    rangeBox.style.width = Math.abs(rightLine.getBoundingClientRect().x - leftLine.getBoundingClientRect().x) + 'px';
}
colorRange();

function rangeLeftSelect() {
    if(bordersGotIntersected()) {
        toggleBorderStyles();
        if (borderLeft.isActualLeftBorder) {
            borderLeft.style.left = (parseFloat(borderLeft.style.left) + borderLeft.getBoundingClientRect().width) + 'px';
            borderRight.style.left = (parseFloat(borderRight.style.left) - borderRight.getBoundingClientRect().width) + 'px';
            // borderLeft.style.left = (Number(borderLeft.style.left.replace('px','')) + borderLeft.getBoundingClientRect().width) + 'px';
            // borderRight.style.left = (Number(borderRight.style.left.replace('px','')) - borderRight.getBoundingClientRect().width) + 'px';
        } else {
            borderLeft.style.left = (parseFloat(borderLeft.style.left) - borderLeft.getBoundingClientRect().width) + 'px';
            borderRight.style.left = (parseFloat(borderRight.style.left) + borderRight.getBoundingClientRect().width) + 'px';
            // borderLeft.style.left = (Number(borderLeft.style.left.replace('px','')) - borderLeft.getBoundingClientRect().width) + 'px';
            // borderRight.style.left = (Number(borderRight.style.left.replace('px','')) + borderRight.getBoundingClientRect().width) + 'px';
        }

        borderRight.offset = borderLeft.isActualLeftBorder == true ? 2 : 0;
        borderLeft.offset = borderLeft.isActualLeftBorder == true ? 0 : 2;
        thumbOffset = (borderLeft.getBoundingClientRect().width / 2) * borderLeft.offset;
    }

    progressBarLine.removeEventListener('pointerdown', borderLeft.trackHandler);
    borderLeft.onpointerdown = (event) => {
        event.stopPropagation();
    }
    colorRange();
}

function rangeRightSelect() {
    if(bordersGotIntersected()) {
        toggleBorderStyles();
        if (borderLeft.isActualLeftBorder) {
            borderLeft.style.left = (parseFloat(borderLeft.style.left) + borderLeft.getBoundingClientRect().width) + 'px';
            borderRight.style.left = (Number(borderRight.style.left) - borderRight.getBoundingClientRect().width) + 'px';
            // borderLeft.style.left = (Number(borderLeft.style.left.replace('px','')) + borderLeft.getBoundingClientRect().width) + 'px';
            // borderRight.style.left = (Number(borderRight.style.left.replace('px','')) - borderRight.getBoundingClientRect().width) + 'px';
        } else {
            borderLeft.style.left = (parseFloat(borderLeft.style.left) - borderLeft.getBoundingClientRect().width) + 'px';
            borderRight.style.left = (parseFloat(borderRight.style.left) + borderRight.getBoundingClientRect().width) + 'px';
            // borderLeft.style.left = (Number(borderLeft.style.left.replace('px','')) - borderLeft.getBoundingClientRect().width) + 'px';
            // borderRight.style.left = (Number(borderRight.style.left.replace('px','')) + borderRight.getBoundingClientRect().width) + 'px';
        }

        borderRight.offset = borderLeft.isActualLeftBorder == true ? 2 : 0;
        borderLeft.offset = borderLeft.isActualLeftBorder == true ? 0 : 2;
        thumbOffset = (borderRight.getBoundingClientRect().width / 2) * borderRight.offset;
    }

    progressBarLine.removeEventListener('pointerdown', borderRight.trackHandler);
    borderRight.onpointerdown = (event) => {
        event.stopPropagation();
    }
    colorRange();
}

function toggleBorderStyles() { 
    borderLeft.classList.toggle('border-wrapper-left');
    borderRight.classList.toggle('border-wrapper-left');

    borderLeft.classList.toggle('border-wrapper-right');
    borderRight.classList.toggle('border-wrapper-right');

    borderLeftTime.classList.toggle('left-time');
    borderRightTime.classList.toggle('left-time');
    
    borderLeftTime.classList.toggle('right-time');
    borderRightTime.classList.toggle('right-time');

    leftPointer.classList.toggle('left-pointer');
    rightPointer.classList.toggle('left-pointer');

    leftPointer.classList.toggle('right-pointer');
    rightPointer.classList.toggle('right-pointer');
    
    rightLockClosed.classList.toggle('left-lock-closed');
    leftLockClosed.classList.toggle('left-lock-closed');

    rightLockClosed.classList.toggle('right-lock-closed');
    leftLockClosed.classList.toggle('right-lock-closed');
    
    rightLockOpen.classList.toggle('left-lock-open');
    leftLockOpen.classList.toggle('left-lock-open');

    rightLockOpen.classList.toggle('right-lock-open');
    leftLockOpen.classList.toggle('right-lock-open');

    borderLeft.isActualLeftBorder = borderLeft.isActualLeftBorder == true ? false : true;
}

function bordersGotIntersected() {
    if((borderLeft.isActualLeftBorder &&
        (borderLeft.getBoundingClientRect().x > borderRight.getBoundingClientRect().x + (borderRight.getBoundingClientRect().width * 2))) || 
        (!borderLeft.isActualLeftBorder &&
        (borderLeft.getBoundingClientRect().x + (borderLeft.getBoundingClientRect().width * 2) < borderRight.getBoundingClientRect().x))) {

            return true;
        } else {
            return false;}
}

function stopPlayerWhenSliderClicked(event) {
    if (!aFile.paused & event.target != playBTN) stopPlaying();
}

function showMute(event) {
    if (event.pageX <= volumeSlider.getBoundingClientRect().x) {
        volumeBTN.style.display = "none";
        volumeOffBTN.style.display = "block";
    } else {
        volumeBTN.style.display = "block";
        volumeOffBTN.style.display = "none"; 
    }
}

let rightLockClosed = document.querySelector('#range-border-right-lock-closed');
let rightLockOpen = document.querySelector('#range-border-right-lock-open');
let leftLockClosed = document.querySelector('#range-border-left-lock-closed');
let leftLockOpen = document.querySelector('#range-border-left-lock-open');
let killBorderRightListeners = true;

rightLockOpen.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    // https://www.cookieshq.co.uk/posts/event-listeners-not-working-troublelshooting
    rightLockOpen.style.display = 'none';
    rightLockClosed.style.display = 'block';
    borderRight.removeEventListener('pointerdown', borderRight.thumbHandler);        
    progressBarLine.removeEventListener('pointerdown', borderRight.trackHandler);
    borderRight.onpointerdown = (event) => {
        event.stopPropagation();
    }
    borderRight.locked = true;
})

leftLockOpen.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    leftLockOpen.style.display = 'none';
    leftLockClosed.style.display = 'block';
    borderLeft.removeEventListener('pointerdown', borderLeft.thumbHandler);        
    progressBarLine.removeEventListener('pointerdown', borderLeft.trackHandler);
    borderLeft.onpointerdown = (event) => {
        event.stopPropagation();
    }
    borderLeft.locked = true;
})

rightLockClosed.addEventListener('pointerdown', (event) => {
    rightLockClosed.style.display = 'none';
    rightLockOpen.style.display = 'block';
    borderRight.locked = false;
    sliderMoveHandler(borderRight, progressBarLine, rangeRightSelect, borderRightTime, borderRightTimeFormat);
})

leftLockClosed.addEventListener('pointerdown', (event) => {
    leftLockClosed.style.display = 'none';
    leftLockOpen.style.display = 'block';
    borderLeft.locked = false;
    sliderMoveHandler(borderLeft, progressBarLine, rangeLeftSelect, borderLeftTime, borderLeftTimeFormat);
})

function drawScale(precision) {
    let denomLarge;
    let denomMiddle;
    let incr;
    switch(precision) {
        case LARGE_SCALE:
            denomLarge = 50;
            denomMiddle = 10;
            incr = 5;
            ruler.removeEventListener('pointerdown', ruler.handler);
            break;
        case MIDDLE_SCALE:
            denomLarge = 10;
            denomMiddle = 5;
            incr = 1;
            ruler.removeEventListener('pointerdown', ruler.handler);
            break;
        case PRECISE_SCALE:
            denomLarge = undefined;
            denomMiddle = 1;
            incr = 1;
            ruler.addEventListener('pointerdown', (event) => {
                swipeRuler(event);
            });
            break;
    }

    ruler.innerHTML = '';
    // for zoomed-in ruler, append short bar between middle bars with numer
    let appendShortBar = false;

    for(let i = 0; i <= durationRounded; i += incr) {
        if (i%denomLarge == 0) {
            const cloneLarge = longBarTemplate.content.cloneNode(true);
            let barNumber = cloneLarge.querySelector("#long-number");
            barNumber.textContent = i;
            ruler.appendChild(cloneLarge);
        } else if (i%denomMiddle == 0) {
            const cloneMiddle = middleBarTemplate.content.cloneNode(true);
            let barNumber = cloneMiddle.querySelector("#middle-number");

            
            if (precision == PRECISE_SCALE) {
                if (zoomThumb.position < 1) {
                    // add number to every 5th bar otherwise insert short bar                    
                    barNumber.textContent = i%5 == 0 ? i : (function(){
                        const cloneShort = shortBarTemplate.content.cloneNode(true);
                        ruler.appendChild(cloneShort);
                        appendShortBar = true;
                    })();

                } else if (zoomThumb.position < 2)  {
                    // add number to every 2nd bar otherwise insert short bar  
                    barNumber.textContent = i%2 == 0 ? i : (function(){
                        const cloneShort = shortBarTemplate.content.cloneNode(true);
                        ruler.appendChild(cloneShort);
                        appendShortBar = true;
                    })();
                } else {
                    barNumber.textContent = i;
                }
            }

            if (appendShortBar == false) ruler.appendChild(cloneMiddle);
            appendShortBar = false;
        } else {
            const cloneShort = shortBarTemplate.content.cloneNode(true);
            ruler.appendChild(cloneShort);
        }



    }
    ruler.firstElementChild.style.marginLeft = 0;
    ruler.lastElementChild.style.marginRight = 0; 
}

// Right-left swiping function for ruler & range slider when zoomed-in
function swipeRuler(event) {
    ruler.pointerOriginX = event.pageX;
    let actualOffsetLeft = ruler.offsetLeft;
    
    // величина сдвига позиции курсора равна перемещению шкалы
    // и RangeSlider
    // остановиться когда достигнут конец шкалы
    // если скорость курсора в момент отжатия кнопки мыши > V,
    // продолжить смещение шкалы и RangeSlider
    // величина остаточного смещения зависит от скорости и коэффициента скорости W

    // prevent default brauser action for drag'n'drop operation
    ruler.ondragstart = () => false;

    // начать отслеживание перемещения курсора и переопределить их на шкалу
    ruler.setPointerCapture(event.pointerId);

    ruler.onpointermove = (event) => {
        let newMarginLeft = actualOffsetLeft + event.pageX - ruler.pointerOriginX;

        if (newMarginLeft > ruler.left) {
                ruler.style.marginLeft = progressBarLine.style.marginLeft = ruler.left + 'px';

        } else if (newMarginLeft + ruler.width - ruler.originalWidth < 0) {
                ruler.style.marginRight = progressBarLine.style.marginRight = '0px';
        } else {
                ruler.style.marginLeft = progressBarLine.style.marginLeft = newMarginLeft + 'px';                            
        }
    }

    ruler.onpointerup = () => {
        ruler.pointerOriginX = undefined;
        ruler.onpointermove = null;
        ruler.onpointerup = null;
    }    
}

// SEGMENT END Auxiliary functions for different sliders


// Template literals can't be directly passed as an argument to a function to be used inside it
// for formatting of the function output. An auxiliary function, which returns a template string
// should be passed instead as an argument and called inside. Here is such auxiliary function. 
let playTimeFormat = function makePlayerTimeFormatString(trackPosition, durationRounded) {
    return `${Math.round(trackPosition)} / ${durationRounded}`;
}

// Global function to handle slider thumb dragging

// Handle thumb movement
// Return thumb position relative to track start
function sliderMoveHandler(thumbObject, trackObject, sliderHandlerFoo, valueDisplayObject, valueDisplayTextFormat) {
    // thumbObject should have following properties
    // thumbObject.offset
    // thumbObject.maxValue
    // thumbObject.position

    // Initialise objects coordinates
    thumbOffset = (thumbObject.getBoundingClientRect().width / 2) * thumbObject.offset;


    let sliderUnit = trackObject.getBoundingClientRect().width / thumbObject.maxValue;

    let thumbInitialPosition = thumbObject.position == 0 ? 0 - thumbOffset : (thumbObject.position * sliderUnit) - thumbOffset;
 
    let originX = trackObject.getBoundingClientRect().x;


    let trackPosition = 0;
    let sliderMaxValueRounded = Math.round(thumbObject.maxValue);

    // prevent default brauser action for drag'n'drop operation
    thumbObject.ondragstart = () => false;
    thumbObject.style.left = thumbInitialPosition + 'px';

    // Listeners to control player thumb position when it is changed manually

    thumbObject.addEventListener('pointerdown', thumbPointerDownHandler);        
    trackObject.addEventListener('pointerdown', trackPointerDownHandler);
    // assign handler function to the object property for outside access
    // to stop EventListener from outside
    thumbObject.thumbHandler = thumbPointerDownHandler;
    thumbObject.trackHandler = trackPointerDownHandler;
   
    function thumbPointerDownHandler (event) {
        // Prevent bubbling the event to the parent (track)
        // and making other listeners of the track (for range slider borders and thumb) to trigger
        event.stopPropagation();
        thumbOffset = (thumbObject.getBoundingClientRect().width / 2) * thumbObject.offset;
        thumbInitialPosition = thumbObject.position == 0 ? 0 - thumbOffset : (thumbObject.position * sliderUnit) - thumbOffset;
        // prevent selection start (browser action)
        // event.preventDefault();

        // начать отслеживание перемещения указателя и переопределить их на ползунок
        thumbObject.setPointerCapture(event.pointerId);

        thumbObject.onpointermove = (event) => {
            
            let lineRightEnd = trackObject.getBoundingClientRect().right;
            let startPosition = originX;

            // if pointer movement should initiate other actions, anable the provided function
            if (typeof sliderHandlerFoo !== 'undefined') sliderHandlerFoo(event);

            if (event.pageX < startPosition) {
                thumbObject.style.left = 0 - thumbOffset + 'px';
                trackPosition = 0;
            } else if (event.pageX > lineRightEnd) {
                thumbObject.style.left = lineRightEnd - startPosition - thumbOffset  + 'px';
                trackPosition = thumbObject.maxValue;
            } else {
                thumbObject.style.left = event.pageX - startPosition - thumbOffset + 'px';
                trackPosition = (event.pageX - startPosition) / sliderUnit;
            }
            thumbObject.position = trackPosition;
            if (typeof thumbObject.left !== 'undefined') thumbObject.left = thumbObject.style.left;

            if (typeof valueDisplayObject !== 'undefined') valueDisplayObject.textContent = valueDisplayTextFormat(trackPosition, sliderMaxValueRounded);
                
        }

        thumbObject.onpointerup = () => {
            borderDragOn = false;
            thumbObject.onpointermove = null;
            thumbObject.onpointerup = null;
        }
    }

    function trackPointerDownHandler (event) {
        // if pointer movement should initiate other actions, anable the provided function
        if (typeof sliderHandlerFoo !== 'undefined') sliderHandlerFoo(event);
        thumbOffset = (thumbObject.getBoundingClientRect().width / 2) * thumbObject.offset;
        thumbInitialPosition = thumbObject.position == 0 ? 0 - thumbOffset : (thumbObject.position * sliderUnit) - thumbOffset;

        let lineRightEnd = trackObject.getBoundingClientRect().right;
        let startPosition = originX;

        if (event.pageX < startPosition) {
            thumbObject.style.left = originX - thumbOffset + 'px';
            trackPosition = 0;
        } else if (event.pageX > lineRightEnd) {
            thumbObject.style.left = lineRightEnd - startPosition  + 'px';
            trackPosition = thumbObject.maxValue;
        } else {
            thumbObject.style.left = event.pageX - startPosition - thumbOffset + 'px';
            trackPosition = (event.pageX - startPosition) / sliderUnit;
        }

        if (typeof valueDisplayObject !== 'undefined') valueDisplayObject.textContent = valueDisplayTextFormat(trackPosition, sliderMaxValueRounded);
        thumbObject.position = trackPosition;
    }
}
// End of Global function


playerBottomMenuWrapper.addEventListener('pointerup', function(event) {
    volumeSliderDragThumbOn = false;
})

function stopPlaying() {    
    aFile.pause();
    clearInterval(intervalsId);
    playerThumb.position = aFile.currentTime;
    playBTN.classList.remove('pause-btn');
    playBTN.classList.add('play-btn');
}

function playLoops() {
    let thumbOffset = playerThumb.getBoundingClientRect().width / 2;
    startPlayAt = playerThumb.position;
    aFile.currentTime = startPlayAt;
    playBTN.classList.remove('play-btn');
    playBTN.classList.add('pause-btn');

 // При передаче методов обьекта в качестве колбэка в функцию, напр setTimeout,
// setInterval теряется контекст исходного обьекта (this) и метод возвращает undefined. Метод setTimeout
// в браузере имеет особенность: он устанавливает this=window для вызова функции. Таким образом, 
// для this.pause он пытается получить window.pause, которого не существует. Чтобы этого избежать,
// можно обернуть вызов в анонимную (или стрелочную) функцию, создав замыкание.
// Этот метод имеет уязвимость если до момента срабатывания setTimeout в переменную aFile будет записано
// другое значение. Для решения это проблемы в современном JavaScript у функций есть встроенный метод bind, 
// который позволяет зафиксировать this у метода при копировании его в переменную
// см. https://learn.javascript.ru/bind#reshenie-2-privyazat-kontekst-s-pomoschyu-bind

    // let stopValue = stopFiled.value == 0 ? aFile.duration : stopFiled.value;
  
    aFile.play();
    // playerThumb.style.left = '';
    intervalsId = setInterval(() => {
        // display current play time on screen
        aFile.volume = volumeSliderThumb.position;  
        playerThumbTime.textContent = `${Math.round(aFile.currentTime)}`;
        // move progress bar Thumb according to the current play time
        playerThumb.position = aFile.currentTime/aFile.duration;
        if (playerThumb.position < 1) {
            playerThumb.style.left = ((aFile.currentTime / aFile.duration) * progressBarLine.getBoundingClientRect().width) + 'px';
        }else {
            clearInterval(intervalsId);
            playBTN.classList.remove('pause-btn');
            playBTN.classList.add('play-btn');
            playerThumb.style.left = 0 + 'px';
            playerThumb.position = 0;
        }

    }, 50);
}