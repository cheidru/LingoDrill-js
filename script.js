let aFile = document.querySelector('#mymusic');
let aTitle = document.querySelector('#played-title');

let playBTN = document.querySelector('#player-btn');
let playerWrapper = document.querySelector('.player');
let stopBTN = document.querySelector('#stop-svg-btn');
let repeatBTN = document.querySelector('#repeat-svg-btn');
let volumeBTN = document.querySelector('#volume-svg-btn');
let volumeMaxBTN = document.querySelector('#volume-max-svg-btn');
let volumeOffBTN = document.querySelector('#volume-off-svg-btn');
let volumeSlider = document.querySelector('#volume-slider-wrapper');

let volumeSliderOn = false;

let startPlayAt = 0;
let durationRounded = 0;
let playTime = document.querySelector('#player-time');
let intervalsId = 0;


let aFileDataLoaded = aFile.addEventListener('loadedmetadata', function() {
    let songDuration = aFile.duration;
    durationRounded = Math.round(songDuration);
    
    // Restore special symbols in audio file URI and get the file name from it
    let songName = decodeURI(aFile.src).split('/').pop();

    aTitle.textContent = songName;
    aTitle.style.transition = "all 18s";
    aTitle.style.marginLeft = `-${songName.length - 37}rem`;    
    setTimeout(function(){aTitle.style.marginLeft = "0rem"}, 18000);
    
    playTime.textContent = `0 / ${durationRounded}`;

    // Make ruler
    let rulerHolder = document.querySelector('#progress-bar-ruler');
    if (durationRounded > 50) {
        largeScale();
    } else {
        smallScale();
    }
})

let longBarTemplate = document.querySelector('#long-bar-template');
let longBarNumber = document.querySelector('#long-number-place');
let shortBarTemplate = document.querySelector('#short-bar-template');
let middleBarTemplate = document.querySelector('#middle-bar-template');
const ruler = document.querySelector("#progress-bar-ruler");       

function largeScale() {
    for(let i = 0; i <= durationRounded; i += 10) {
        if (i%50 == 0) {
            if(i > 0) {
                const cloneShort = shortBarTemplate.content.cloneNode(true);
                ruler.appendChild(cloneShort);
            }
            const clone = longBarTemplate.content.cloneNode(true);
            let barNumber = clone.querySelector("#long-number");
            barNumber.textContent = i;
            ruler.appendChild(clone);
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

let currentTime = aFile.currentTime;

playBTN.addEventListener('click', () => {
    aFile.paused ? playLoops() : stopPlaying()});

volumeBTN.addEventListener('click', () => {
    if (volumeSlider.style.visibility == 'hidden') {
        volumeSlider.style.visibility = 'visible';
    } else {
        volumeSlider.style.visibility = 'hidden';
    }
});

repeatBTN.addEventListener('click', () => {
    if(aFile.loop == true) {
        aFile.loop = false;
        repeatBTN.style.fill = "gray";
    } else {
        aFile.loop = true;
        repeatBTN.style.fill = "rgb(113, 150, 218)";
    };
});

stopBTN.addEventListener('click', () => {
    stopPlaying();
    clearInterval(intervalsId);
    playBTN.classList.remove('pause-btn');
    playBTN.classList.add('play-btn');
    progressBarThumb.style.left = thumbInitialPosition - originX + 'px';
    startPlayAt = (thumbInitialPosition - lineLeftEnd + thumbOffset) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
    playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
})

function volumeSliderShow() {
    volumeSliderWrapper.style.visibility = "visible";
};

function volumeSliderHide() {   
    volumeSliderWrapper.style.visibility = "hidden"; 
};

let progressBarThumb = document.querySelector('#player-progress-bar-thumb');
let progressBarLine = document.querySelector('#player-progress-bar-track');
let progressBarWrapper = document.querySelector('#player-progress-bar-wrapper');

let volumeSliderThumb = document.querySelector('#volume-slider-thumb');
let volumeSliderTrack = document.querySelector('#volume-slider-track');
let volumeSliderWrapper = document.querySelector('#volume-slider-wrapper');

let progressBarDragThumbOn = false;
let volumeSliderDragThumbOn = false;

// Progress bar coordinates
let playerLeftEnd = playerWrapper.getBoundingClientRect().left;
let thumbInitialPosition = progressBarThumb.getBoundingClientRect().left;
let thumbOffset = progressBarThumb.getBoundingClientRect().width / 2;
let lineLeftEnd = progressBarLine.getBoundingClientRect().x;
let lineRightEnd = progressBarLine.getBoundingClientRect().right;
let originX = progressBarWrapper.getBoundingClientRect().x;
let playTimeRatio = aFile.duration / progressBarLine.getBoundingClientRect().width;

// Volume slider coordinates
let volumeSliderLeftEnd = volumeSliderWrapper.getBoundingClientRect().left;
let vsThumbInitialPosition = volumeSliderThumb.getBoundingClientRect().left;
let vsThumbOffset = volumeSliderThumb.getBoundingClientRect().width / 2;
let vsTrackLeftEnd = volumeSliderTrack.getBoundingClientRect().x;
let vsTrackRightEnd = volumeSliderTrack.getBoundingClientRect().right;
let vsOriginX = volumeSliderWrapper.getBoundingClientRect().x;
let vsTimeRatio = 1 / volumeSliderTrack.getBoundingClientRect().width;

    
progressBarThumb.addEventListener('pointerdown', function(event) {
    // разрешено перемещение ползунка
    progressBarDragThumbOn = true;
});

progressBarLine.addEventListener('pointerdown', function(event) {
    if (!aFile.paused & event.target != playBTN) stopPlaying();
    // переносим ползунок под курсор    
    progressBarThumb.style.left = event.pageX - originX - thumbOffset + 'px';
    startPlayAt = (event.pageX - lineLeftEnd) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
    // startPlayAt = (event.pageX - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
    playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
    aFile.currentTime = startPlayAt;
});

progressBarWrapper.addEventListener('pointermove', function(event) {
    if (progressBarDragThumbOn == true) {
        if (!aFile.paused & event.target != playBTN) stopPlaying();
        if (event.pageX < lineLeftEnd) {
            progressBarThumb.style.left = thumbInitialPosition - originX + 'px';
            startPlayAt = (thumbInitialPosition - lineLeftEnd + thumbOffset) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
            playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;            
        } else if (event.pageX > lineRightEnd) {
            progressBarThumb.style.left = lineRightEnd - originX - thumbOffset + 'px';
            startPlayAt = (lineRightEnd - lineLeftEnd) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
            playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
        } else {
            progressBarThumb.style.left = event.pageX - originX - thumbOffset + 'px';
            startPlayAt = (event.pageX - lineLeftEnd) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
            playTime.textContent = `${Math.round(startPlayAt)} / ${durationRounded}`;
        }
        aFile.currentTime = startPlayAt;
    }        
})

progressBarWrapper.addEventListener('pointerup', function(event) {
    progressBarDragThumbOn = false;
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

