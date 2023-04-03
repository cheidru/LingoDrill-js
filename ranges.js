let aFile = document.querySelector('#mymusic');
let aTitle = document.querySelector('#played-title');
let songDuration = 0;

// Volume slider elements
let volumeSliderThumb = document.querySelector('#volume-slider-thumb');
let volumeSliderTrack = document.querySelector('#volume-slider-track');


let playerBottomMenuWrapper = document.querySelector('#player-bottom-menu-wrapper');
let volumeBTN = document.querySelector('#volume-svg-btn');
let volumeOffBTN = document.querySelector('#volume-svg-btn-off');
let volumeSlider = document.querySelector('#volume-slider-track');

volumeSlider.style.display = 'none';
const volumeDefaultLevel = 0.5;

let volumeActualLevel = {
    position: volumeDefaultLevel
}

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
// console.log("DB record ID: ", audioFileID, typeof audioFileID);
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
    let songDuration = aFile.duration;
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
        console.log("Make Large ruler");
        largeScale();
    } else {
        smallScale();
    }

    function largeScale() {
        for(let i = 0; i <= durationRounded; i += 10) {
            if (i%50 == 0) {
                if(i > 0) { // other than first one, LongBar is preceded by ShortBar
                    const cloneShort = shortBarTemplate.content.cloneNode(true);
                    ruler.appendChild(cloneShort);
                }
                const cloneLong = longBarTemplate.content.cloneNode(true);
                let barNumber = cloneLong.querySelector("#long-number");
                barNumber.textContent = i;
                ruler.appendChild(cloneLong);
            } else {
                const cloneShort = shortBarTemplate.content.cloneNode(true);
                ruler.appendChild(cloneShort);
                const cloneMiddle = middleBarTemplate.content.cloneNode(true);
                ruler.appendChild(cloneMiddle);
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

    // Activate slider for ranges



    // Activate slider for ZOOM



    // Activate slider for volume
    volumeSlider.style.display = 'block';
    sliderMoveHandler(volumeSliderThumb, volumeSliderTrack, 1, volumeActualLevel, 1, showMute, undefined, undefined);
    volumeSlider.style.display = 'none';

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
let zoomValueObject = {
    position: 0
};
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
sliderMoveHandler(zoomThumb, zoomTrack, zoomMaxValue, zoomValueObject, 1, makeZoom);
// SEGMENT END: ZOOM Slider


// Common for borders
let progressBarLine = document.querySelector('#player-progress-bar-track');
let progressBarLineSpan = progressBarLine.getBoundingClientRect().width;

// SEGMENT: Range Selection Border Left


// Elements
let borderLeft = document.querySelector('#range-border-wrapper-left');
let borderLeftStopObject = {
    position: 0
}

// Auxiliary function
function rangeSelectLeft() {
        //ToDo
        //Highlight selected area from left to right border
        //Show play ? and save icons for the selection
}

// Slider function execution
sliderMoveHandler(borderLeft, progressBarLine, songDuration, borderLeftStopObject, 1, rangeSelectLeft);

// SEGMENT END: Range Selection Border Left


// SEGMENT: Range Selection Border Right

// Elements
let borderRight = document.querySelector('#range-border-wrapper-right');

let borderRightStopObject = {
    position: borderRight.getBoundingClientRect.x
}

// Auxiliary function
function rangeSelectRight() {
        //ToDo
        //Highlight selected area from left to right border
        //Show play ? and save icons for the selection
}

// Slider function execution
sliderMoveHandler(borderRight, progressBarLine, songDuration, borderRightStopObject, 2, rangeSelectRight);
// SEGMENT END: Range Selection Border Right


// SEGMENT Auxiliary functions for different sliders
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
function sliderMoveHandler(thumbObject, trackObject, sliderMaxValue, thumbPosition, offsetKey, sliderHandlerFoo, valueDisplayObject, valueDisplayTextFormat) {

    // Initialise objects coordinates
    let thumbOffset = (thumbObject.getBoundingClientRect().width / 2) * offsetKey;
    let sliderUnit = trackObject.getBoundingClientRect().width / sliderMaxValue;
    let thumbInitialPosition = thumbPosition.position == 0 ? 0 - thumbOffset : (thumbPosition.position * sliderUnit) - thumbOffset;
 
    let originX = trackObject.getBoundingClientRect().x;
    console.log("sliderUnit: ", sliderUnit);

    let trackPosition = 0;
    let sliderMaxValueRounded = Math.round(sliderMaxValue);

    // prevent default brauser action for drag'n'drop operation
    thumbObject.ondragstart = () => false;
    thumbObject.style.left = thumbInitialPosition + 'px';

    // Listeners to control player thumb position when it is changed manually
    thumbObject.onpointerdown = function(event) {
        // Prevent bubbling the event to the parent (track)
        // and making other listeners of the track (for range slider borders and thumb) to trigger
        event.stopPropagation();
        // prevent selection start (browser action)
        // event.preventDefault();

        // начать отслеживание перемещения указателя и переопределить их на ползунок
        thumbObject.setPointerCapture(event.pointerId);

        thumbObject.onpointermove = function(event) {

                // if pointer movement should initiate other actions, anable the provided function
                if (typeof sliderHandlerFoo !== 'undefined') sliderHandlerFoo(event);

                let lineRightEnd = trackObject.getBoundingClientRect().right;
                let startPosition = originX;
    
                if (event.pageX < startPosition) {
                    thumbObject.style.left = 0 - thumbOffset + 'px';
                    console.log("thumbObject.style.left: ", thumbObject.style.left, "thumbOffset: ", thumbOffset);
                    trackPosition = 0;
                } else if (event.pageX > lineRightEnd) {
                    thumbObject.style.left = lineRightEnd - startPosition - thumbOffset  + 'px';
                    trackPosition = durationRounded;
                } else {
                    thumbObject.style.left = event.pageX - startPosition - thumbOffset + 'px';
                    trackPosition = (event.pageX - startPosition) / sliderUnit;
                }
                thumbPosition.position = trackPosition;
                if (typeof valueDisplayObject !== 'undefined') valueDisplayObject.textContent = valueDisplayTextFormat(trackPosition, sliderMaxValueRounded);
        }

        thumbObject.onpointerup = () => {
            thumbObject.onpointermove = null;
            thumbObject.onpointerup = null;
        }

    }   
    
    trackObject.addEventListener('pointerdown', function(event) {
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
        thumbPosition.position = trackPosition;
    })

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
        aFile.volume = volumeActualLevel.position;  
        playTime.textContent = `${Math.round(aFile.currentTime)} / ${durationRounded}`;
        // move progress bar Thumb according to the current play time
        let progressBarThumbPosition = aFile.currentTime/aFile.duration;
          // console.log("startPlayAt:", startPlayAt);
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