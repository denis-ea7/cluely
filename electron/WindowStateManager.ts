import fs from "fs"
import path from "path"
import { app } from "electron"

export interface WindowState {
  width: number
  height: number
  x: number
  y: number
}

export class WindowStateManager {
  private statePath: string
  private cached: WindowState | null = null

  constructor() {
    const dir = app.getPath("userData")
    this.statePath = path.join(dir, "window-state.json")
  }

  public load(): WindowState | null {
    try {
      const raw = fs.readFileSync(this.statePath, "utf8")
      const data = JSON.parse(raw)
      if (data && typeof data.width === "number" && typeof data.height === "number") {
        this.cached = {
          width: data.width,
          height: data.height,
          x: typeof data.x === "number" ? data.x : 0,
          y: typeof data.y === "number" ? data.y : 0
        }
        return this.cached
      }
      return null
    } catch {
      return null
    }
  }

  public save(state: WindowState): void {
    this.cached = state
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), "utf8")
    } catch (error) {
      console.error("[WindowStateManager] Failed to save window state:", error)
    }
  }

  public clear(): void {
    this.cached = null
    try {
      fs.unlinkSync(this.statePath)
    } catch {}
  }
}

