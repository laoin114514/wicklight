export interface ImageAsset {
  image: HTMLImageElement | null;
  ready: boolean;
}

export class Assets {
  private images = new Map<string, ImageAsset>();
  private pending = 0;
  onProgress?: (loaded: number, total: number) => void;

  load(name: string, url: string): void {
    if (this.images.has(name)) return;
    const asset: ImageAsset = { image: null, ready: false };
    this.images.set(name, asset);
    if (typeof Image === 'undefined') {
      asset.ready = true;
      return;
    }
    this.pending += 1;
    const img = new Image();
    img.onload = () => {
      asset.image = img;
      asset.ready = true;
      this.pending -= 1;
      this.progress();
    };
    img.onerror = () => {
      asset.ready = false;
      this.pending -= 1;
      this.progress();
    };
    img.src = url;
  }

  private progress(): void {
    if (this.onProgress) this.onProgress(this.images.size - this.pending, this.images.size);
  }

  get(name: string): HTMLImageElement | null {
    const a = this.images.get(name);
    return a && a.ready && a.image ? a.image : null;
  }

  has(name: string): boolean {
    const a = this.images.get(name);
    return !!a && a.ready && !!a.image;
  }

  get loading(): boolean {
    return this.pending > 0;
  }
}
