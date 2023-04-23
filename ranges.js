let aFile = document.querySelector('#mymusic');
let aTitle = document.querySelector('#played-title');
let songDuration = 0;

let borderDragOn = false;

// Volume slider elements
let volumeSliderThumb = document.querySelector('#volume-slider-thumb');
const volumeDefaultLevel = 0.5;
volumeSliderThumb.position = volumeDefaultLevel;
let volumeSliderTrack = document.querySelector('#volume-slider-track');


let playerBottomMenuWrapper = document.querySelector('#player-bottom-menu-wrapper');
let volumeBTN = document.querySelector('#volume-svg-btn');
let volumeOffBTN = document.querySelector('#volume-svg-btn-off');
let volumeSlider = document.querySelector('#volume-slider-track');

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

let borderLeft = document.querySelector('#range-border-wrapper-left');
let borderRight = document.querySelector('#range-border-wrapper-right');

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

    let longBarTemplate = document.querySelector('#long-bar-template');
    let shortBarTemplate = document.querySelector('#short-bar-template');
    let middleBarTemplate = document.querySelector('#middle-bar-template');
    const ruler = document.querySelector("#progress-bar-ruler");      

    if (durationRounded > 70) {
        largeScale();
    } else {
        smallScale();
    }

    function largeScale() {
        for(let i = 0; i <= durationRounded; i += 5) {
            if (i%50 == 0) {
                if(i > 0) { // other than first one, LongBar is preceded by ShortBar
                    const cloneShort = shortBarTemplate.content.cloneNode(true);
                    ruler.appendChild(cloneShort);
                }
                const cloneLong = longBarTemplate.content.cloneNode(true);
                let barNumber = cloneLong.querySelector("#long-number");
                barNumber.textContent = i;
                ruler.appendChild(cloneLong);
            } else if (i%10 == 0) {
                const cloneMiddle = middleBarTemplate.content.cloneNode(true);
                ruler.appendChild(cloneMiddle);
            } else {
                const cloneShort = shortBarTemplate.content.cloneNode(true);
                ruler.appendChild(cloneShort);
            }
        }
    }

    function smallScale() {
        for(let i = 0; i <= durationRounded; i++) {
            if (i%10 == 0) {
                if (i != 0) {
                    const cloneShort = shortBarTemplate.content.cloneNode(true);
                    ruler.appendChild(cloneShort);
                }
                const clone = longBarTemplate.content.cloneNode(true);
                let barNumber = clone.querySelector("#long-number");
                barNumber.textContent = i;
                ruler.appendChild(clone);
            } else if (i%5 == 0) {
                const cloneMiddle = middleBarTemplate.content.cloneNode(true);
                ruler.appendChild(cloneMiddle);
            } else {
                const cloneShort = shortBarTemplate.content.cloneNode(true);
                ruler.appendChild(cloneShort);
            }  
        }
    }

    // Move the first ruler notch to the very left
    // and the right ruler notch to the very right

    // appendChild in largeScale and smallScale functions
    // adds CarretReturn text node before child element
    // and therefore firstChild will refer to it
    // firstElementChild refers to div correctly

    ruler.firstElementChild.style.marginLeft = 0;
    ruler.lastElementChild.style.marginRight = 0;
    // SEGMENT END: Create Ruler

    // Activate slider for volume
    volumeSlider.style.display = 'block';
    sliderMoveHandler(volumeSliderThumb, volumeSliderTrack, 1, 1, showMute, undefined, undefined);
    volumeSlider.style.display = 'none';

    // Slider function execution after songDuration is determined
    sliderMoveHandler(borderLeft, progressBarLine, songDuration, 0, rangeLeftSelect, borderLeftTime, borderLeftTimeFormat);
    borderRightTime.textContent = durationRounded;
    sliderMoveHandler(borderRight, progressBarLine, songDuration, 2, rangeRightSelect, borderRightTime, borderRightTimeFormat);

})
// SEGMENT END: Read audio file data from DB


let currentTime = aFile.currentTime;

playBTN.addEventListener('click', () => {
    aFile.paused ? playLoops() : stopPlaying()});

stopBTN.addEventListener('click', () => {
    progressBarThumb.style.left = thumbInitialPosition - thumbOffset + 'px';
    playTime.textContent = `0 / ${durationRounded}`;
    aFile.currentTime = 0;
    stopPlaying();    
})

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

// SEGMENT: ZOOM Slider
// ToDo

// Elements
let zoomThumb = document.querySelector('#zoom-thumb-svg-btn');
let zoomTrack = document.querySelector('#zoom-track');
let zoomMaxValue = 3;
zoomThumb.position = 0;

// Auxiliary function
function makeZoom(zoomValue) {
    //ToDo
    // Scale the ruler up or down
    // Change the combination of long/middle/short bars depending on magnification
    // Change long bar numbers when needed
    // Hide audio track out of view    
    // Add side elements to indicate that some audio track os out of view
    // Add drag functionality to move audion track left-right
    // Redraw audio track (selected parts) and the scale when being dragged
}

// Slider function execution
sliderMoveHandler(zoomThumb, zoomTrack, zoomMaxValue, 1, makeZoom);
// SEGMENT END: ZOOM Slider

// Common for borders
let progressBarLine = document.querySelector('#player-progress-bar-track');
let progressBarLineSpan = progressBarLine.getBoundingClientRect().width;

// SEGMENT: Range Selection Border Left
// Elements

let borderLeftStyles = getComputedStyle(borderLeft);
borderLeft.pointerId = 0;
borderLeft.name = 'borderLeft';
borderLeft.left = '0px';
borderLeft.position = 0;
borderLeft.locked = false;

// Auxiliary function
let borderLeftTime = document.querySelector('#left-border-time');
let borderLeftTimeFormat = function makeborderLeftTimeFormatString(trackPosition) {
    return `${Math.round(trackPosition)}`;
}
// SEGMENT END: Range Selection Border Left

// SEGMENT: Range Selection Border Right
// Elements

let borderRightStyles = getComputedStyle(borderRight);
borderRight.pointerId = 0;
borderRight.name = 'borderRight';
borderRight.left = borderRightStyles.left;
borderRight.position = borderRight.getBoundingClientRect.x;
borderRight.locked = false;

// Auxiliary function
let borderRightTime = document.querySelector('#right-border-time');
let borderRightTimeFormat = function makeborderRightTimeFormatString(trackPosition) {
    return `${Math.round(trackPosition)}`;
}
// SEGMENT END: Range Selection Border Right

// SEGMENT Auxiliary functions for different sliders

let rangeBox = document.querySelector('#range-box');
let leftLine = document.querySelector('#border-line-left');
let leftLineStyles = getComputedStyle(leftLine);
leftLine.style.left = leftLineStyles.left;
let rightLine = document.querySelector('#border-line-right');
let rightLineStyles  = getComputedStyle(rightLine);
let timeStyles = getComputedStyle(borderLeftTime);

function colorRange() {
    // rangeBox height is equal to range border height minus time field height, minus 5px of lock svg image
    rangeBox.style.height = ((borderRightStyles.height).replace('px','') - (timeStyles.height).replace('px','') - 6) + 'px';
    rangeBox.style.left = (leftLine.getBoundingClientRect().x - progressBarLine.getBoundingClientRect().x) + 'px';
    rangeBox.style.top = '0.55rem';
    rangeBox.style.width = (rightLine.getBoundingClientRect().x - leftLine.getBoundingClientRect().x) + 'px';
}

colorRange();

function rangeLeftSelect() {
    switchBorderWrappers();
    colorRange();
}




function rangeRightSelect() {
    switchBorderWrappers();
    colorRange();
}


function switchBorderWrappers() {
    let borderRightSideLeftCoord = borderRight.getBoundingClientRect().x;
    let borderLeftSideRightCoord = borderLeft.getBoundingClientRect().x + borderLeft.getBoundingClientRect().width;

    if (borderDragOn && borderLeftSideRightCoord < borderRightSideLeftCoord) {
        event.target === borderLeft ? unfreezeBorderWrapper(borderRight): unfreezeBorderWrapper(borderLeft);
    } else if (borderDragOn) return; // Avoid switching to another border while borders intersect when one is being dragged
    // Borders intersection starts

    if (rightLine.getBoundingClientRect().x - leftLine.getBoundingClientRect().x < borderRight.getBoundingClientRect().width * 2) { 
    // if (rightLine.getBoundingClientRect().x <= leftLine.getBoundingClientRect().x) {  
        console.log('borderRight.getBoundingClientRect().width: ', borderRight.getBoundingClientRect().width, "rightLine.getBoundingClientRect().x - leftLine.getBoundingClientRect().x: ", rightLine.getBoundingClientRect().x - leftLine.getBoundingClientRect().x ); 
        console.log("target: ", event.target);

        borderDragOn = true;

        event.target === borderLeft ? 
         (() => {freezeBorderWrapper(borderLeft); switchActiveBorderTo(borderRight);})():
         (() => {freezeBorderWrapper(borderRight); switchActiveBorderTo(borderLeft);})();
    }

    // Overlapping starts
    // console.log('rangeLeftSelect');    
    // borderLeft.removeEventListener('pointerdown', borderLeft.thumbHandler);  
    // console.log("borderRight.getBoundingClientRect().x :", borderRight.getBoundingClientRect().x, "borderLeftComputedStyles.wydth: ", borderLeftComputedStyles.wydth);
    // let stopPosition = borderRight.style.left;    
    // progressBarLine.removeEventListener('pointerdown', borderLeft.trackHandler);
    // borderLeft.onpointerdown = (event) => {
    //     event.stopPropagation();
    // }
    // borderLeft.onpointermove = null;
    // borderLeft.releasePointerCapture(borderLeft.pointerId);

    // let clickEvent = new MouseEvent('pointerdown');
    // clickEvent.pointerId = borderRight.pointerId;
    // borderRight.dispatchEvent(clickEvent);
    // let dragEvent = new MouseEvent('mousemove');
    // borderRight.dispatchEvent(dragEvent);
    // console.log('rightLine x: ', rightLine.getBoundingClientRect().x, 'leftLine x: ', leftLine.getBoundingClientRect().x);
    // sliderMoveHandler(borderLeft, progressBarLine, songDuration, 0, rangeLeftSelect, borderLeftTime, borderLeftTimeFormat);


            // let rightLineOldPosition = rightLine.getBoundingClientRect().x
            // setTimeout(() => {
            //     borderDragOn = rightLineOldPosition > rightLine.getBoundingClientRect().x ? true : false;
            //     borderLeft.style.left = stopPosition.replace('px','') - borderLeftStyles.width + 'px';
            //     console.log("borderLeft.getBoundingClientRect().x", borderLeft.getBoundingClientRect().x);
            // }, 50);

        // } else if(event.target === borderRight) {
            // // console.log('rangeRightSelect');
            // // console.log('event.target', event.target);
            // // console.log('rightLine x: ', rightLine.getBoundingClientRect().x, '\nleftLine x: ', leftLine.getBoundingClientRect().x);
            // borderRight.removeEventListener('pointerdown', borderRight.thumbHandler);  
            // // console.log("right listener removed");
            // let stopPosition = borderLeft.style.left;         
            // progressBarLine.removeEventListener('pointerdown', borderRight.trackHandler);
            // borderRight.onpointerdown = (event) => {
            //     event.stopPropagation();
            // }
            // borderRight.onpointermove = null;
            // borderRight.releasePointerCapture(borderRight.pointerId);
            // let clickEvent = new MouseEvent('pointerdown');
            // clickEvent.pointerId = borderLeft.pointerId;
            // borderLeft.dispatchEvent(clickEvent);
            // let dragEvent = new MouseEvent('mousemove')
            // borderLeft.dispatchEvent(dragEvent);
            // // console.log('rightLine x: ', rightLine.getBoundingClientRect().x, 'leftLine x: ', leftLine.getBoundingClientRect().x);
            // sliderMoveHandler(borderRight, progressBarLine, songDuration, 2, rangeRightSelect, borderRightTime, borderRightTimeFormat);
            // let leftLineOldPosition = leftLine.getBoundingClientRect().x
            // setTimeout(() => {
            //     borderDragOn = leftLineOldPosition < leftLine.getBoundingClientRect().x ? true : false;
            //     borderRight.style.left = stopPosition.replace('px','') + borderRightStyles.width + 'px';
            // }, 50);

        }
    

function freezeBorderWrapper(borderWrapperObject) {
    // Overlapping starts
    console.log('freezeBorderWrapper of ', borderWrapperObject);    
    borderWrapperObject.removeEventListener('pointerdown', borderWrapperObject.thumbHandler);    
    progressBarLine.removeEventListener('pointerdown', borderWrapperObject.trackHandler);
    borderWrapperObject.onpointerdown = (event) => {
        event.stopPropagation();
    }
    borderWrapperObject.onpointermove = null;
    borderWrapperObject.releasePointerCapture(borderWrapperObject.pointerId);
}

function switchActiveBorderTo(borderObjectGetFocus) {
    console.log('switch to ', borderObjectGetFocus);  
    // Consider locked object
    let clickEvent = new MouseEvent('pointerdown');
    clickEvent.pointerId = borderObjectGetFocus.pointerId;
    borderObjectGetFocus.dispatchEvent(clickEvent);
    let dragEvent = new MouseEvent('mousemove');
    borderObjectGetFocus.dispatchEvent(dragEvent);
    if (borderObjectGetFocus == borderLeft) { 
        borderRight.style.left = borderLeftStyles.left;
    } else {
        borderLeft.style.left = ((borderLeftStyles.left).replace('px','') - borderRight.getBoundingClientRect().width) + 'px';
    }
        // borderLeft.style.left = ((borderLeftStyles.left).replace('px','') - borderRight.getBoundingClientRect().width) + 'px';
    console.log('borderRight: ', borderRight, 'borderLeft: ', borderLeft);
}

function unfreezeBorderWrapper(wrapperObject){
    if (wrapperObject == borderLeft) sliderMoveHandler(borderLeft, progressBarLine, songDuration, 0, rangeLeftSelect, borderLeftTime, borderLeftTimeFormat);
    if (wrapperObject == borderRight) sliderMoveHandler(borderRight, progressBarLine, songDuration, 2, rangeRightSelect, borderRightTime, borderRightTimeFormat);
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
    sliderMoveHandler(borderRight, progressBarLine, songDuration, 2, rangeRightSelect, borderRightTime, borderRightTimeFormat);
})

leftLockClosed.addEventListener('pointerdown', (event) => {
    leftLockClosed.style.display = 'none';
    leftLockOpen.style.display = 'block';
    borderLeft.locked = false;
    sliderMoveHandler(borderLeft, progressBarLine, songDuration, 0, rangeLeftSelect, borderLeftTime, borderLeftTimeFormat);
})


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
function sliderMoveHandler(thumbObject, trackObject, sliderMaxValue, offsetKey, sliderHandlerFoo, valueDisplayObject, valueDisplayTextFormat) {

    // Initialise objects coordinates
    let thumbOffset = (thumbObject.getBoundingClientRect().width / 2) * offsetKey;

    let sliderUnit = trackObject.getBoundingClientRect().width / sliderMaxValue;
    let thumbInitialPosition = thumbObject.position == 0 ? 0 - thumbOffset : (thumbObject.position * sliderUnit) - thumbOffset;
 
    let originX = trackObject.getBoundingClientRect().x;


    let trackPosition = 0;
    let sliderMaxValueRounded = Math.round(sliderMaxValue);

    // prevent default brauser action for drag'n'drop operation
    thumbObject.ondragstart = () => false;
    thumbObject.style.left = thumbInitialPosition + 'px';

    // Listeners to control player thumb position when it is changed manually

    thumbObject.addEventListener('pointerdown', thumbPointerDownHandler);        
    trackObject.addEventListener('pointerdown', trackPointerDownHandler);
    thumbObject.thumbHandler = thumbPointerDownHandler;
    thumbObject.trackHandler = trackPointerDownHandler;
   
    function thumbPointerDownHandler (event) {
        // Prevent bubbling the event to the parent (track)
        // and making other listeners of the track (for range slider borders and thumb) to trigger
        event.stopPropagation();
        // prevent selection start (browser action)
        // event.preventDefault();

        // начать отслеживание перемещения указателя и переопределить их на ползунок
        thumbObject.setPointerCapture(event.pointerId);
        thumbObject.pointerId = event.pointerId;

        thumbObject.onpointermove = function(event) {

                // if pointer movement should initiate other actions, anable the provided function
                if (typeof sliderHandlerFoo !== 'undefined') sliderHandlerFoo(event);

                let lineRightEnd = trackObject.getBoundingClientRect().right;
                let startPosition = originX;
    
                if (event.pageX < startPosition) {
                    thumbObject.style.left = 0 - thumbOffset + 'px';
                    trackPosition = 0;
                } else if (event.pageX > lineRightEnd) {
                    thumbObject.style.left = lineRightEnd - startPosition - thumbOffset  + 'px';
                    trackPosition = durationRounded;
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

        let lineRightEnd = trackObject.getBoundingClientRect().right;
        let startPosition = originX;

        if (event.pageX < startPosition) {
            thumbObject.style.left = originX - thumbOffset + 'px';
            trackPosition = 0;
        } else if (event.pageX > lineRightEnd) {
            thumbObject.style.left = lineRightEnd - startPosition  + 'px';
            trackPosition = durationRounded;
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
    startPlayAt = aFile.currentTime;
    playAtObject.position = aFile.currentTime;
    playBTN.classList.remove('pause-btn');
    playBTN.classList.add('play-btn');
}

function playLoops() {
    let thumbOffset = progressBarThumb.getBoundingClientRect().width / 2;
    startPlayAt = playAtObject.position;
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
    // progressBarThumb.style.left = '';
    intervalsId = setInterval(() => {
        // display current play time on screen
        aFile.volume = volumeSliderThumb.position;  
        playTime.textContent = `${Math.round(aFile.currentTime)} / ${durationRounded}`;
        // move progress bar Thumb according to the current play time
        let progressBarThumbPosition = aFile.currentTime/aFile.duration;
        if (progressBarThumbPosition < 1) progressBarThumb.style.left = (aFile.currentTime / (aFile.duration / progressBarLine.getBoundingClientRect().width)) - thumbOffset + 'px';
        else {
            clearInterval(intervalsId);
            playBTN.classList.remove('pause-btn');
            playBTN.classList.add('play-btn');
            progressBarThumb.style.left = 0 - thumbOffset + 'px';
            // progressBarThumb.style.left = thumbInitialPosition - originX + 'px';
            // startPlayAt = thumbInitialPosition * (aFile.duration / progressBarLine.getBoundingClientRect().width);
            startPlayAt = 0;
            playAtObject.position = 0;
            playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
        }

    }, 50);
}