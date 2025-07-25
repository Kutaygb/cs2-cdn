import { readdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import {
  existsSync,
  mkdirSync,
} from "node:fs";
import vpk from "vpk";
import { exec } from "node:child_process";
import winston from "winston";
import os from "node:os";

interface Config {
  directory: string;
  stickers: boolean;
  patches: boolean;
  graffiti: boolean;
  characters: boolean;
  musicKits: boolean;
  cases: boolean;
  tools: boolean;
  statusIcons: boolean;
  weapons: boolean;
  otherWeapons: boolean;
  setIcons: boolean;
  seasonIcons: boolean;
  premierSeasons: boolean;
  tournaments: boolean;
  logLevel: string;
  source2Viewer: string;
}

const DEFAULT_CONFIG: Config = {
  directory: "data",
  stickers: true,
  patches: true,
  graffiti: true,
  characters: true,
  musicKits: true,
  cases: true,
  tools: true,
  statusIcons: true,
  weapons: true,
  otherWeapons: true,
  setIcons: true,
  seasonIcons: true,
  premierSeasons: true,
  tournaments: true,
  logLevel: "info",
  source2Viewer: "Source2Viewer-CLI",
};

const ECON_PATH = "panorama/images/econ";

const neededDirectories: Record<string, string> = {
  stickers: `${ECON_PATH}/stickers`,
  patches: `${ECON_PATH}/patches`,
  graffiti: `${ECON_PATH}/stickers/default`,
  characters: `${ECON_PATH}/characters`,
  musicKits: `${ECON_PATH}/music_kits`,
  cases: `${ECON_PATH}/weapon_cases`,
  tools: `${ECON_PATH}/tools`,
  statusIcons: `${ECON_PATH}/status_icons`,
  weapons: `${ECON_PATH}/default_generated`,
  otherWeapons: `${ECON_PATH}/weapons`,
  seasonIcons: `${ECON_PATH}/season_icons`,
  premierSeasons: `${ECON_PATH}/premier_seasons`,
  tournaments: `${ECON_PATH}/tournaments`,
  setIcons: `${ECON_PATH}/set_icons`,
};

const neededFiles: Record<string, string> = {
  itemsGame: "scripts/items/items_game.txt",
  csgoEnglish: "resource/csgo_english.txt",
};

class VPKExtractor {
  private config: Config;
  private log: winston.Logger;
  private vpkDir: vpk;

  constructor(config: Partial<Config>) {
    this.config = Object.assign({}, DEFAULT_CONFIG, config);

    this.log = winston.createLogger({
      level: this.config.logLevel,
      transports: [
        new winston.transports.Console({
          format: winston.format.printf((info) => {
            return `[vpk-extractor] ${info.level}: ${info.message}`;
          }),
        }),
      ],
    });

    this.extractPNGs();
  }

  async extractPNGs(): Promise<void> {
    try {
      // VPK dosyasının varlığını kontrol et
      const vpkPath = `${this.config.directory}/game/csgo/pak01_dir.vpk`;
      if (!existsSync(vpkPath)) {
        this.log.error(`VPK file not found at: ${vpkPath}`);
        return;
      }

      // Source2Viewer executable'ının varlığını kontrol et
      const platform = os.platform();
      const executable = platform === "win32" 
        ? `${this.config.directory}/${this.config.source2Viewer}.exe`
        : `${this.config.directory}/${this.config.source2Viewer}`;

      if (!existsSync(executable)) {
        this.log.error(`Source2Viewer not found at: ${executable}`);
        this.log.info("Please ensure Source2Viewer-CLI.exe is in the data directory");
        return;
      }

      this.log.info("Loading VPK files...");
      this.loadVPK();

      this.log.info("Starting PNG extraction...");
      await this.dumpFiles();
      await this.renameFiles();

      this.log.info("PNG extraction completed successfully!");
    } catch (error) {
      this.log.error("Error during extraction:", error);
    }
  }

  loadVPK(): void {
    this.vpkDir = new vpk(`${this.config.directory}/game/csgo/pak01_dir.vpk`);
    this.vpkDir.load();
    this.log.info(`Loaded VPK with ${this.vpkDir.files.length} files`);
  }

  async dumpFiles(): Promise<void> {
    try {
      const pathsToDump = Object.keys(neededDirectories)
        .filter((f) => this.config[f as keyof Config] === true)
        .map((f) => neededDirectories[f])
        .concat(Object.keys(neededFiles).map((f) => neededFiles[f]));

      this.log.info(`Extracting ${pathsToDump.length} directories/files...`);

      await Promise.all(
        pathsToDump.map(
          (path) =>
            new Promise<void>((resolve, reject) => {
              this.log.debug(`Dumping ${path}...`);
              
              const platform = os.platform();
              const executable = platform === "win32" 
                ? `"${this.config.directory}\\${this.config.source2Viewer}.exe"`
                : `${this.config.directory}/${this.config.source2Viewer}`;
            
              const nullRedirect = platform === "win32" ? "> nul 2>&1" : "> /dev/null 2>&1";
              
              const cmd = `${executable} --input "${this.config.directory}\\game\\csgo\\pak01_dir.vpk" --vpk_filepath "${path}" -o "${this.config.directory}" -d ${nullRedirect}`;
              
              exec(cmd, (error) => {
                if (error) {
                  this.log.warn(`Warning extracting ${path}:`, error.message);
                }
                resolve();
              });
            }),
        ),
      );
    } catch (error) {
      this.log.error("Error dumping files:", error);
    }
  }

  async renameFiles(): Promise<void> {
    try {
      this.log.info("Renaming _png.png files to .png...");
      
      const files = await readdir(this.config.directory, {
        withFileTypes: true,
        recursive: true,
      });

      let renamedCount = 0;
      
      for (const file of files) {
        if (file.isFile() && file.name.endsWith("_png.png")) {
          try {
            const oldPath = join(file.parentPath, file.name);
            const newName = `${basename(file.name, "_png.png")}.png`;
            const newPath = join(dirname(oldPath), newName);

            const { rename } = await import("node:fs/promises");
            await rename(oldPath, newPath);
            renamedCount++;
            
            if (renamedCount % 100 === 0) {
              this.log.debug(`Renamed ${renamedCount} files...`);
            }
          } catch (renameError) {
            this.log.warn(`Failed to rename ${file.name}:`, renameError);
          }
        }
      }

      this.log.info(`Successfully renamed ${renamedCount} PNG files`);
    } catch (error) {
      this.log.error("Error renaming files:", error);
    }
  }
}

new VPKExtractor({
  stickers: false,
  patches: false,
  graffiti: false,
  characters: false,
  musicKits: false,
  cases: false,
  tools: false,
  statusIcons: true,
  weapons: false,
  otherWeapons: false,
  setIcons: false,
  seasonIcons: false,
  premierSeasons: true,
  tournaments: false,
});