let aFile = document.querySelector('#mymusic');
let aTitle = document.querySelector('#played-title');

let playBTN = document.querySelector('#player-btn');
let playerWrapper = document.querySelector('.player');
let stopBTN = document.querySelector('#stop-svg-btn');
let repeatBTN = document.querySelector('#repeat-svg-btn');
let volumeBTN = document.querySelector('#volume-svg-btn');
let volumeOffBTN = document.querySelector('#volume-svg-btn-off');
let volumeSlider = document.querySelector('#volume-slider-wrapper');
// CSS style property is void before being checked
// Assign property a value to get it set
volumeSlider.style.visibility = 'hidden';

let songName = '';
// Restore special symbols in audio file URI and get the file name from it
// let songName = decodeURI(aFile.src).split('/').pop();

let volumeSliderOn = false;
const volumeDefaultLevel = 0.5;
let volumeActualLevel = volumeDefaultLevel;

let startPlayAt = 0;
let durationRounded = 0;
let playTime = document.querySelector('#player-time');
let intervalsId = 0;


// SEGMENT: Read audio file data from DB
let audioFileID = localStorage.getItem('aFileID');
console.log("DB recoed ID: ", audioFileID, typeof audioFileID);
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

let aFileDataLoaded = aFile.addEventListener('loadedmetadata', function() {
    let songDuration = aFile.duration;
    durationRounded = Math.round(songDuration);

    aTitle.textContent = songName;
    aTitle.style.transition = "all 18s";
    aTitle.style.marginLeft = `-${songName.length - 37}rem`;    
    setTimeout(function(){aTitle.style.marginLeft = "0rem"}, 18000);
    
    playTime.textContent = `0 / ${durationRounded}`;
})


let currentTime = aFile.currentTime;

playBTN.addEventListener('click', () => {
    aFile.paused ? playLoops() : stopPlaying()});

stopBTN.addEventListener('click', () => {
    stopPlaying();
    clearInterval(intervalsId);
    playBTN.classList.remove('pause-btn');
    playBTN.classList.add('play-btn');
    progressBarThumb.style.left = thumbInitialPosition - originX + 'px';
    startPlayAt = (thumbInitialPosition - lineLeftEnd + thumbOffset) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
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

// Progress bar elements
let progressBarThumb = document.querySelector('#player-progress-bar-thumb');
let progressBarLine = document.querySelector('#player-progress-bar-track');
let progressBarWrapper = document.querySelector('#player-progress-bar-wrapper');
// let progressBarDragThumbOn = false;

// Progress bar coordinates
let playerLeftEnd = playerWrapper.getBoundingClientRect().left;
let thumbInitialPosition = progressBarThumb.getBoundingClientRect().left;
let thumbOffset = progressBarThumb.getBoundingClientRect().width / 2;
let lineLeftEnd = progressBarLine.getBoundingClientRect().x;
let lineRightEnd = progressBarLine.getBoundingClientRect().right;
let originX = progressBarWrapper.getBoundingClientRect().x;


let playTimeRatio = aFile.duration / progressBarLine.getBoundingClientRect().width;

// Check
// progressBarLine.addEventListener('pointerdown'
startPlayAt = (event.pageX - lineLeftEnd) * (aFile.duration / progressBarLine.getBoundingClientRect().width);

// progressBarWrapper.addEventListener('pointermove'
// if (event.pageX < lineLeftEnd) Track passed left border
startPlayAt = (thumbInitialPosition - lineLeftEnd + thumbOffset) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
// else if (event.pageX > lineRightEnd) Track passed right border
startPlayAt = (lineRightEnd - lineLeftEnd) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
// else Track is within thack borders
startPlayAt = (event.pageX - lineLeftEnd) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
//

// Handle thumb movement
// Return thumb position relative to track start
sliderMoveHandler(progressBarThumb, progressBarLine)


// Global function to handle slider thumb dragging

function sliderMoveHandler(thumbObject, trackObject, wrapperObject, ShandlerFoo) {
    let dragThumbOn = false; // Thumb movement is allowed

    // Initialise objects coordinates
    // let playerLeftEnd = wrapperObject.getBoundingClientRect().left;
    let thumbInitialPosition = thumbObject.getBoundingClientRect().left;
    let thumbOffset = thumbObject.getBoundingClientRect().width / 2;
    let lineLeftEnd = trackObject.getBoundingClientRect().left;
    let lineRightEnd = trackObject.getBoundingClientRect().right;
    let originX = wrapperObject.getBoundingClientRect().x;
    // let playTimeRatio = aFile.duration / progressBarLine.getBoundingClientRect().width;

    // Listeners to control player thumb position when it is changed manually
    thumbObject.addEventListener('pointerdown', function(event) {
        // разрешено перемещение ползунка
        dragThumbOn = true;
    });

    progressBarLine.addEventListener('pointerdown', function(event) {
        if (!aFile.paused & event.target != playBTN) stopPlaying();
        // переносим ползунок под курсор    
        thumbObject.style.left = event.pageX - originX - thumbOffset + 'px';
        // startPlayAt = (event.pageX - lineLeftEnd) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
        playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
        aFile.currentTime = startPlayAt;
    });

    progressBarWrapper.addEventListener('pointermove', function(event) {
        if (dragThumbOn == true) {
            // ??
            if (!aFile.paused & event.target != playBTN) stopPlaying();

            if (event.pageX < lineLeftEnd) {
                thumbObject.style.left = thumbInitialPosition - originX + 'px';
                // startPlayAt = (thumbInitialPosition - lineLeftEnd + thumbOffset) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
                playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;            
            } else if (event.pageX > lineRightEnd) {
                thumbObject.style.left = lineRightEnd - originX - thumbOffset + 'px';
                // startPlayAt = (lineRightEnd - lineLeftEnd) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
                playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
            } else {
                thumbObject.style.left = event.pageX - originX - thumbOffset + 'px';
                // startPlayAt = (event.pageX - lineLeftEnd) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
                playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
            }
            aFile.currentTime = startPlayAt;
        }        
    })

    progressBarWrapper.addEventListener('pointerup', function(event) {
        dragThumbOn = false;
    })

}



// End of Global function


// Volume slider elements
let volumeSliderThumb = document.querySelector('#volume-slider-thumb');
let volumeSliderTrack = document.querySelector('#volume-slider-track');
let volumeSliderWrapper = document.querySelector('#volume-slider-wrapper');
let playerBottomMenuWrapper = document.querySelector('#player-bottom-menu-wrapper');

let volumeSliderDragThumbOn = false;

// Volume slider coordinates
let volumeSliderLeftEnd = volumeSliderWrapper.getBoundingClientRect().left;
let vsThumbInitialPosition = volumeSliderThumb.getBoundingClientRect().left;
let vsThumbOffset = volumeSliderThumb.getBoundingClientRect().width / 2;
let vsTrackLeftEnd = volumeSliderTrack.getBoundingClientRect().x;
let vsTrackRightEnd = volumeSliderTrack.getBoundingClientRect().right;
let vsOriginX = volumeSliderWrapper.getBoundingClientRect().x;
let vsTrackSpan = volumeSliderTrack.getBoundingClientRect().width;

// Initial volume slider thumb position
volumeSliderThumb.style.left = volumeActualLevel * volumeSliderTrack.getBoundingClientRect().width + 'px';
aFile.volume = volumeActualLevel;

// Listeners to control volume slider thumb position when it is changed manually
volumeSliderThumb.addEventListener('pointerdown', function(event) {
    // разрешено перемещение ползунка
    volumeSliderDragThumbOn = true;
});

volumeSliderTrack.addEventListener('pointerdown', function(event) {
    // переносим ползунок под курсор    
    volumeSliderThumb.style.left = event.pageX - vsOriginX - vsThumbOffset + 'px';
    volumeActualLevel = (event.pageX - vsTrackLeftEnd) / vsTrackSpan;
    // startPlayAt = (event.pageX - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
    aFile.volume = volumeActualLevel;
});

volumeSliderWrapper.addEventListener('pointermove', function(event) {

    if (volumeSliderDragThumbOn == true) {
        if (event.pageX <= vsTrackLeftEnd) {
            volumeSliderThumb.style.left = vsThumbInitialPosition - vsOriginX + 'px';
            volumeActualLevel = 0;
            volumeBTN.style.display = "none";
            volumeOffBTN.style.display = "block";
        } else if (event.pageX >= vsTrackRightEnd) {
            volumeSliderThumb.style.left = vsTrackRightEnd - vsOriginX - vsThumbOffset + 'px';
            volumeActualLevel = 1;
        } else {
            volumeBTN.style.display = "block";
            volumeOffBTN.style.display = "none";
            volumeSliderThumb.style.left = event.pageX - vsOriginX - vsThumbOffset + 'px';
            volumeActualLevel = (event.pageX - vsTrackLeftEnd) / vsTrackSpan;
        }
        aFile.volume = volumeActualLevel;
    }        
})

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
    let stopValue = aFile.duration;
    aFile.play();
    // progressBarThumb.style.left = '';
    intervalsId = setInterval(() => {
        // display current play time on screen
        playTime.textContent = `${Math.round(aFile.currentTime)} / ${durationRounded}`;
        // move progress bar Thumb according to the current play time
        let progressBarThumbPosition = aFile.currentTime/aFile.duration;
        if (progressBarThumbPosition < 1) progressBarThumb.style.left = (progressBarThumbPosition * progressBarLine.clientWidth) + lineLeftEnd - originX - thumbOffset + 'px';
        // if (progressBarThumbPosition <= 1) progressBarThumb.style.transform = `translate(${(progressBarThumbPosition * progressBarLine.clientWidth)}px, 0px)`;
        else {
            clearInterval(intervalsId);
            playBTN.classList.remove('pause-btn');
            playBTN.classList.add('play-btn');
            progressBarThumb.style.left = thumbInitialPosition - originX + 'px';
            startPlayAt = (thumbInitialPosition - lineLeftEnd + thumbOffset) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
            playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
        }
    }, 50);
}

document.querySelector('#add-new-range-menu').addEventListener('click', () => window.open('ranges.html'));
