let valueDisplayText = "";

let aFile = document.querySelector('#mymusic');
let aTitle = document.querySelector('#played-title');

let playBTN = document.querySelector('#player-btn');
let playerWrapper = document.querySelector('.player');
let stopBTN = document.querySelector('#stop-svg-btn');
let repeatBTN = document.querySelector('#repeat-svg-btn');
let volumeBTN = document.querySelector('#volume-svg-btn');

let songName = '';

let startPlayAt = 0;
let songDuration = 0;
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
// SEGMENT END: Read audio file data from DB


// Progress bar elements
let progressBarThumb = document.querySelector('#player-progress-bar-thumb');
let progressBarLine = document.querySelector('#player-progress-bar-track');
let progressBarWrapper = document.querySelector('#player-progress-bar-wrapper');

// Progress bar coordinates
let playerLeftEnd = playerWrapper.getBoundingClientRect().left;
let thumbInitialPosition = 0;
// let thumbInitialPosition = progressBarThumb.getBoundingClientRect().left;
let thumbOffset = progressBarThumb.getBoundingClientRect().width / 2;
let lineRightEnd = progressBarLine.getBoundingClientRect().right;
let originX = progressBarWrapper.getBoundingClientRect().x;



let playAtObject = {
    position: startPlayAt
}

// Volume slider elements
let volumeSliderThumb = document.querySelector('#volume-slider-thumb');
let volumeSliderTrack = document.querySelector('#volume-slider-track');
let volumeSliderWrapper = document.querySelector('#volume-slider-wrapper');
let playerBottomMenuWrapper = document.querySelector('#player-bottom-menu-wrapper');

// Volume slider coordinates
let volumeSliderLeftEnd = volumeSliderWrapper.getBoundingClientRect().left;
let vsThumbInitialPosition = volumeSliderThumb.getBoundingClientRect().left;
let vsThumbOffset = volumeSliderThumb.getBoundingClientRect().width / 2;
let vsTrackLeftEnd = volumeSliderTrack.getBoundingClientRect().x;
let vsTrackRightEnd = volumeSliderTrack.getBoundingClientRect().right;
let vsOriginX = volumeSliderWrapper.getBoundingClientRect().x;

let vsTrackSpan = volumeSliderTrack.getBoundingClientRect().width;

let volumeOffBTN = document.querySelector('#volume-svg-btn-off');
let volumeSlider = document.querySelector('#volume-slider-wrapper');
let volumeSliderOn = false;
const volumeDefaultLevel = 0.5;
let volumeActualLevel = volumeDefaultLevel;

// CSS style property is void before being checked
// Assign property a value to get it set
volumeSlider.style.visibility = 'hidden';

// Initial volume slider thumb position
volumeSliderThumb.style.left = volumeActualLevel * volumeSliderTrack.getBoundingClientRect().width + 'px';
aFile.volume = volumeActualLevel;

// // Listeners to control volume slider thumb position when it is changed manually
// volumeSliderThumb.addEventListener('pointerdown', function(event) {
//     // разрешено перемещение ползунка
//     volumeSliderDragThumbOn = true;
// });

// volumeSliderTrack.addEventListener('pointerdown', function(event) {
//     // переносим ползунок под курсор    
//     volumeSliderThumb.style.left = event.pageX - vsOriginX - vsThumbOffset + 'px';
//     volumeActualLevel = (event.pageX - vsTrackLeftEnd) / vsTrackSpan;
//     aFile.volume = volumeActualLevel;
// });

// volumeSliderWrapper.addEventListener('pointermove', function(event) {

//     if (volumeSliderDragThumbOn == true) {
//         if (event.pageX <= vsTrackLeftEnd) {
//             volumeSliderThumb.style.left = vsThumbInitialPosition - vsOriginX + 'px';
//             volumeActualLevel = 0;
//             volumeBTN.style.display = "none";
//             volumeOffBTN.style.display = "block";
//         } else if (event.pageX >= vsTrackRightEnd) {
//             volumeSliderThumb.style.left = vsTrackRightEnd - vsOriginX - vsThumbOffset + 'px';
//             volumeActualLevel = 1;
//         } else {
//             volumeBTN.style.display = "block";
//             volumeOffBTN.style.display = "none";
//             volumeSliderThumb.style.left = event.pageX - vsOriginX - vsThumbOffset + 'px';
//             volumeActualLevel = (event.pageX - vsTrackLeftEnd) / vsTrackSpan;
//         }
//         aFile.volume = volumeActualLevel;
//     }        
// })






let aFileDataLoaded = aFile.addEventListener('loadedmetadata', function() {
    songDuration = aFile.duration;
    durationRounded = Math.round(songDuration);

    // Restore special symbols in audio file URI and get the file name from it
    // let songName = decodeURI(aFile.src).split('/').pop();

    aTitle.textContent = songName;
    aTitle.style.transition = "all 18s";
    aTitle.style.marginLeft = `-${songName.length - 37}rem`;    
    setTimeout(function(){aTitle.style.marginLeft = "0rem"}, 18000);
    
    playTime.textContent = `0 / ${durationRounded}`;


    // Slider for audio player
    sliderMoveHandler(progressBarThumb, progressBarLine, songDuration, playAtObject, stopPlayerWhenSliderClicked,
        playTime, playTimeFormat);
    
    // Slider for volume slider
    // sliderMoveHandler(progressBarThumb, progressBarLine, songDuration, playerWrapper, stopPlayerWhenSliderClicked,
    //     playTime, playTimeFormat);

    volumeActualLevel = sliderMoveHandler(volumeSliderThumb, volumeSliderTrack, 1, volumeActualLevel, null, null, null);
})

let currentTime = aFile.currentTime;

playBTN.addEventListener('click', () => {
    aFile.paused ? playLoops() : stopPlaying()});

stopBTN.addEventListener('click', () => {
    stopPlaying();
    clearInterval(intervalsId);
    playBTN.classList.remove('pause-btn');
    playBTN.classList.add('play-btn');
    progressBarThumb.style.left = thumbInitialPosition + 'px';
    startPlayAt = thumbInitialPosition * (aFile.duration / progressBarLine.getBoundingClientRect().width);
    playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
})

repeatBTN.addEventListener('click', () => {
    if(aFile.loop == true) {
        aFile.loop = false;
        repeatBTN.style.fill = "gray";
    } else {
        aFile.loop = true;
        repeatBTN.style.fill = "rgb(65, 105, 225)";
    };
});

volumeBTN.addEventListener('click', () => {
    if (volumeSlider.style.visibility == 'hidden') {
        volumeSlider.style.visibility = 'visible';
    } else {
        volumeSlider.style.visibility = 'hidden';
    }
});

volumeOffBTN.addEventListener('click', () => {
    if (volumeSlider.style.visibility == 'hidden') {
        volumeSlider.style.visibility = 'visible';
    } else {
        volumeSlider.style.visibility = 'hidden';
    }
});

function stopPlayerWhenSliderClicked(event) {
    if (!aFile.paused & event.target != playBTN) stopPlaying();
}

// Template literals can't be directly passed as an argument to a function to be used inside it
// for formatting of the function output. An auxiliary function, which returns a template string
// should be passed instead as an argument and called inside. Here is such auxiliary function. 
let playTimeFormat = function makePlayerTimeFormatString(trackPosition, durationRounded) {
    return `${Math.round(trackPosition)} / ${durationRounded}`;
}

// Global function to handle slider thumb dragging

// Handle thumb movement
// Return thumb position relative to track start
function sliderMoveHandler(thumbObject, trackObject, sliderMaxValue, thumbPosition, sliderHandlerFoo, valueDisplayObject, valueDisplayTextFormat) {

    // Initialise objects coordinates
    let thumbOffset = thumbObject.getBoundingClientRect().width / 2;
    let thumbInitialPosition = thumbPosition.position == 0 ? 0 - thumbOffset : thumbPosition.position - thumbOffset;
 
    let originX = trackObject.getBoundingClientRect().x;

    let trackPosition = 0;
    let sliderMaxValueRounded = Math.round(sliderMaxValue);

    // prevent default brauser action for drag'n'drop operation
    thumbObject.ondragstart = () => false;
    thumbObject.style.left = thumbInitialPosition + 'px';

    // Listeners to control player thumb position when it is changed manually
    thumbObject.onpointerdown = function(event) {

        // prevent selection start (browser action)
        // event.preventDefault();

        // начать отслеживание перемещения указателя и переопределить их на ползунок
        thumbObject.setPointerCapture(event.pointerId);

        thumbObject.onpointermove = function(event) {

                // if pointer movement should initiate other actions, anable the provided function
                if (typeof sliderHandlerFoo !== 'undefined') sliderHandlerFoo(event);

                let lineRightEnd = trackObject.getBoundingClientRect().right;
                let startPosition = originX + thumbOffset;
    
                if (event.pageX < startPosition) {
                    thumbObject.style.left = 0 - thumbOffset + 'px';
                    trackPosition = 0;
                } else if (event.pageX > (lineRightEnd)) {
                    thumbObject.style.left = lineRightEnd - startPosition  + 'px';
                    trackPosition = durationRounded;
                } else {
                    thumbObject.style.left = event.pageX - startPosition + 'px';
                    trackPosition = (event.pageX - startPosition) * (sliderMaxValue / trackObject.getBoundingClientRect().width);
                }
                console.log("trackObject.getBoundingClientRect().width:", trackObject.getBoundingClientRect().width);
                thumbPosition.position = trackPosition;
                valueDisplayObject.textContent = valueDisplayTextFormat(trackPosition, sliderMaxValueRounded);
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
        let startPosition = originX + thumbOffset;

        if (event.pageX < startPosition) {
            thumbObject.style.left = 0 - thumbOffset + 'px';
            trackPosition = 0;
        } else if (event.pageX > (lineRightEnd)) {
            thumbObject.style.left = lineRightEnd - startPosition  + 'px';
            trackPosition = durationRounded;
        } else {
            thumbObject.style.left = event.pageX - startPosition + 'px';
            trackPosition = (event.pageX - startPosition) * (sliderMaxValue / trackObject.getBoundingClientRect().width);
        }
        console.log("trackObject.getBoundingClientRect().width:", trackObject.getBoundingClientRect().width);
        valueDisplayObject.textContent = valueDisplayTextFormat(trackPosition, sliderMaxValueRounded);
        // aFile.currentTime = startPlayAt;
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
    playBTN.classList.remove('pause-btn');
    playBTN.classList.add('play-btn');
}

function playLoops() {
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
        playTime.textContent = `${Math.round(aFile.currentTime)} / ${durationRounded}`;
        // move progress bar Thumb according to the current play time
        let progressBarThumbPosition = aFile.currentTime/aFile.duration;
          console.log("aFile.duration, progressBarLine.getBoundingClientRect().width:", aFile.duration, progressBarLine.getBoundingClientRect().width);
        if (progressBarThumbPosition < 1) progressBarThumb.style.left = (startPlayAt / (aFile.duration / progressBarLine.getBoundingClientRect().width)) + 'px';
        // if (progressBarThumbPosition < 1) progressBarThumb.style.left = (progressBarThumbPosition * progressBarLine.getBoundingClientRect().width) + 'px';
        // if (progressBarThumbPosition < 1) progressBarThumb.style.left = (progressBarThumbPosition * progressBarLine.clientWidth) + 'px';
        // if (progressBarThumbPosition <= 1) progressBarThumb.style.transform = `translate(${(progressBarThumbPosition * progressBarLine.clientWidth)}px, 0px)`;
        else {
            clearInterval(intervalsId);
            playBTN.classList.remove('pause-btn');
            playBTN.classList.add('play-btn');
            progressBarThumb.style.left = 0 - originX - thumbOffset + 'px';
            // progressBarThumb.style.left = thumbInitialPosition - originX + 'px';
            startPlayAt = thumbInitialPosition * (aFile.duration / progressBarLine.getBoundingClientRect().width);
            playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
        }

    }, 50);
}

document.querySelector('#add-new-range-menu').addEventListener('click', () => window.open('ranges.html'));
