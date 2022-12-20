let aFile = document.querySelector('#mymusic');
let atitle = document.querySelector('#played-title');
let durationField = document.querySelector('#duration-field');
let currentTimeField = document.querySelector('#current-time-field');

let currentLoopField = document.querySelector('#current-loop-field');
currentLoopField.textContent = 0;    

let playBTN = document.querySelector('#play-btn');
// let pauseBTN = document.querySelector('#pause-btn');
let stopBTN = document.querySelector('#stop-btn');
let startFiled = document.querySelector('#start-time-field');
let stopFiled = document.querySelector('#stop-time-field');
let loopsField = document.querySelector('#loops');

let rulerHolder = document.querySelector('#progress-bar-ruler');

let durationRounded = 0;

let aFileDataLoaded = aFile.addEventListener('loadedmetadata', function() {
    let songDuration = aFile.duration;
    durationRounded = Math.round(songDuration);
    durationField.textContent = durationRounded + " sec";
    startFiled.setAttribute('max',`${durationRounded}`);
    stopFiled.setAttribute('max',`${durationRounded}`);
    // Restore special symbols in audio file URI and get the file name from it
    let songName = decodeURI(aFile.src).split('/').pop();
    atitle.textContent = songName;
    // Get file name text length in pixel
    let titleWidth = atitle.clientWidth;
    atitle.style.transition = "all 18s";
    atitle.style.marginLeft = `-${songName.length - 37}rem`;
    setTimeout(function(){atitle.style.marginLeft = "0rem"}, 18000);
    
    // Make ruler
    if (durationRounded > 50) {
        largeScale();
    } else {
        smallScale();
    }
});

let longBarTemplate = document.querySelector('#long-bar-template');
let longBarNumber = document.querySelector('#long-number-place');
let shortBarTemplate = document.querySelector('#short-bar-template');
let middleBarTemplate = document.querySelector('#middle-bar-template');
const ruler = document.querySelector("#progress-bar-ruler");       

// let longBarTemplateClone = longBarTemplate.content.cloneNode(true);
// let shortBarTemplateClone = shortBarTemplate.content.cloneNode(true);
// let middleBarTemplateClone = middleBarTemplate.content.cloneNode(true);

// Number(rulerLengthInput.value)

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
let currentTimeRounded = Math.round(currentTime);
currentTimeField.textContent = currentTimeRounded;


let loopsNumber = loopsField.value == 0 ? 1 : loopsField.value;

stopBTN.addEventListener('click', () => {
    aFile.pause();
    aFile.currentTime = 0;}
    );

playBTN.addEventListener('click', playLoops);


function playLoops() {
    if(aFile.paused == false || aFile.currentTime == 0) {
        aFile.currentTime = startFiled.value;
        let loop = 1;
        currentLoopField.textContent = loop;
    }
    aFile.play();

// При передаче методов обьекта (здесь pause) в качестве колбэка в функцию, напр setTimeout,
// setInterval теряется контекст исходного обьекта (this) и метод возвращает undefined. Метод setTimeout
// в браузере имеет особенность: он устанавливает this=window для вызова функции. Таким образом, 
// для this.pause он пытается получить window.pause, которого не существует. Чтобы этого избежать,
// можно обернуть вызов в анонимную (или стрелочную) функцию, создав замыкание.
// Этот метод имеет уязвимость если до момента срабатывания setTimeout в переменную aFile будет записано
// другое значение. Для решения это проблемы в современном JavaScript у функций есть встроенный метод bind, 
// который позволяет зафиксировать this у метода при копировании его в переменную
// см. https://learn.javascript.ru/bind#reshenie-2-privyazat-kontekst-s-pomoschyu-bind

    let stopValue = stopFiled.value == 0 ? aFile.duration : stopFiled.value;

    let progressBarThumb = document.querySelector('#player-progress-bar-thumb');
    let progressBarLine = document.querySelector('#player-progress-bar-line');
 
    setInterval(() => {
        // display current play time on screen
        currentTimeField.textContent = Math.round(aFile.currentTime);
        // move progress bar Thumb according to the current play time
        let progressBarThumbPosition = aFile.currentTime/aFile.duration;
        if (progressBarThumbPosition <= 1) progressBarThumb.style.transform = `translate(${progressBarThumbPosition * progressBarLine.clientWidth}px, 0px)`;
    }, 500);
    let loopsEnacted = setInterval(() => {
        aFile.currentTime = startFiled.value;
        loop++;
        currentLoopField.textContent = loop;
        aFile.play();},
        (stopValue - startFiled.value)*1000);
    
    // Stop playing loops
    setTimeout(() => {aFile.pause();
        aFile.currentTime = 0;
        currentLoopField.textContent = 0;
        clearInterval(loopsEnacted)},
        (stopValue - startFiled.value)*1000*loopsNumber);
}