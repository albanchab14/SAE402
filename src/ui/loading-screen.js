// Loading screen with progress indicator
export class LoadingScreen {
    constructor() {
        this.overlay = document.getElementById('loading-screen');
        this.progressBar = document.getElementById('loading-progress');
        this.statusText = document.getElementById('loading-status');
    }

    setProgress(pct, text = '') {
        if (this.progressBar) {
            this.progressBar.style.width = `${pct}%`;
        }
        if (this.statusText && text) {
            this.statusText.textContent = text;
        }
    }

    hide() {
        if (this.overlay) {
            this.overlay.classList.add('fade-out');
            setTimeout(() => {
                this.overlay.style.display = 'none';
            }, 600);
        }
    }
}
