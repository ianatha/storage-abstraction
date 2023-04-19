import "jasmine";
import fs from "fs";
import to from "await-to-js";
import path from "path";
import rimraf from "rimraf";
import dotenv from "dotenv";
import uniquid from "uniquid";
import slugify from "slugify";
import { Storage } from "../src/Storage";
import { AdapterConfig, StorageType } from "../src/types";
import { copyFile } from "./util";
dotenv.config();

const type = process.env["TYPE"];
const configUrl = process.env["CONFIG_URL"];
const bucketName = process.env["BUCKET_NAME"];
const directory = process.env["LOCAL_DIRECTORY"];
const projectId = process.env["GOOGLE_CLOUD_PROJECT_ID"];
const keyFilename = process.env["GOOGLE_CLOUD_KEYFILE"];
const accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];
const region = process.env["AWS_REGION"];
const applicationKeyId = process.env["B2_APPLICATION_KEY_ID"];
const applicationKey = process.env["B2_APPLICATION_KEY"];

console.log(
  type,
  configUrl,
  bucketName,
  directory,
  projectId,
  keyFilename,
  accessKeyId,
  secretAccessKey
);

let config: AdapterConfig | string = "";
if (type === StorageType.LOCAL) {
  config = {
    type,
    directory,
  };
} else if (type === StorageType.GCS) {
  config = {
    type,
    bucketName,
    projectId,
    keyFilename,
  };
} else if (type === StorageType.S3) {
  config = {
    type,
    bucketName,
    accessKeyId,
    secretAccessKey,
    region,
  };
} else if (type === StorageType.B2) {
  config = {
    type,
    bucketName,
    applicationKeyId,
    applicationKey,
  };
} else {
  if (!configUrl) {
    config = `local://${process.cwd()}/the-buck`;
  } else {
    config = configUrl;
  }
}

const newBucketName = `bucket-${uniquid()}-${new Date().getTime()}`;

console.log("CONFIG", config);
console.log("newBucketName:", newBucketName, "\n");

let storage: Storage;
// try {
//   storage = new Storage(config);
//   await storage.init();
//   console.log(storage.getConfiguration());
// } catch (e) {
//   console.error(`\x1b[31m${e.message}`);
//   process.exit(0);
// }

const waitABit = async (millis = 100): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(() => {
      // console.log(`just wait a bit (${millis}ms)`);
      resolve();
    }, millis);
  });

function streamToString(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

describe(`[testing ${type} storage]`, async () => {
  // beforeAll(async () => {
  //   storage = new Storage(config);
  //   await storage.init();
  //   console.log("beforeAll");
  //   console.log(storage.getConfiguration());
  // });

  beforeEach(() => {
    // increase this value if you experience a lot of timeouts
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000;
  });

  afterAll(async () => {
    await storage.clearBucket(slugify(bucketName as string));
    if (storage.getType() === StorageType.LOCAL) {
      await storage.deleteBucket("new-bucket");
    }
    // cleaning up test data
    rimraf(path.join(process.cwd(), `test-*.jpg`), () => {
      console.log("all cleaned up!");
    });
  });

  it("init", async () => {
    try {
      storage = new Storage(config);
      await storage.init();
    } catch (e) {
      console.error(e);
      return;
    }
  });

  it("test", async () => {
    try {
      await storage.test();
    } catch (e) {
      console.error(e);
      return;
    }
  });

  it("create bucket", async () => {
    // console.log(storage.getSelectedBucket());
    await expectAsync(storage.createBucket(storage.getSelectedBucket())).toBeResolved();
  });

  // it("wait it bit", async () => {
  //   await expectAsync(waitABit(2000)).toBeResolved();
  // });

  it("clear bucket", async () => {
    await expectAsync(storage.clearBucket()).toBeResolved();
  });

  it("check if bucket is empty", async () => {
    const files = await storage.listFiles().catch((e) => {
      console.log(e.message);
    });
    expect(files).toEqual([]);
  });

  it("add file success", async () => {
    await expectAsync(
      storage.addFileFromPath("./tests/data/image1.jpg", "image1.jpg")
    ).toBeResolved();
  });

  it("add file error", async () => {
    await expectAsync(
      storage.addFileFromPath("./tests/data/non-existent.jpg", "non-existent.jpg")
    ).toBeRejected();
  });

  it("add with new name and dir", async () => {
    await expectAsync(
      storage.addFileFromPath("./tests/data/image1.jpg", "subdir/renamed.jpg")
    ).toBeResolved();
  });

  it("list files 1", async () => {
    const expectedResult: [string, number][] = [
      ["image1.jpg", 32201],
      ["subdir/renamed.jpg", 32201],
    ];
    await expectAsync(storage.listFiles()).toBeResolvedTo(expectedResult);
  });

  it("remove file success", async () => {
    await expectAsync(storage.removeFile("subdir/renamed.jpg")).toBeResolved();
  });

  it("remove file again", async () => {
    await expectAsync(storage.removeFile("subdir/renamed.jpg")).toBeResolved();
  });

  it("list files 2", async () => {
    const expectedResult: [string, number][] = [["image1.jpg", 32201]];
    await expectAsync(storage.listFiles()).toBeResolvedTo(expectedResult);
  });

  it("get readable stream", async () => {
    await expectAsync(storage.getFileAsReadable("image1.jpg")).toBeResolved();
  });

  it("get readable stream error", async () => {
    await expectAsync(storage.getFileAsReadable("image2.jpg")).toBeRejected();
  });

  it("get readable stream and save file", async () => {
    try {
      const readStream = await storage.getFileAsReadable("image1.jpg");
      const filePath = path.join(process.cwd(), "tests", "tmp", `test-${storage.getType()}.jpg`);
      const writeStream = fs.createWriteStream(filePath);
      await copyFile(readStream, writeStream);
    } catch (e) {
      console.log(e);
      throw e;
    }
  });

  it("get readable stream partially and save file", async () => {
    const filePath = path.join(process.cwd(), "tests", "tmp", `test-${storage.getType()}-part.jpg`);
    try {
      const readStream = await storage.getFileAsReadable("image1.jpg", { end: 2999 });
      const writeStream = fs.createWriteStream(filePath);
      await copyFile(readStream, writeStream);
    } catch (e) {
      console.log(e);
      throw e;
    }
    const size = (await fs.promises.stat(filePath)).size;
    expect(size).toBe(3000);
  });

  it("add file from stream", async () => {
    const stream = fs.createReadStream("./tests/data/image2.jpg");
    await expectAsync(storage.addFileFromReadable(stream, "image2.jpg")).toBeResolved();
  });

  it("add file from buffer", async () => {
    const buffer = await fs.promises.readFile("./tests/data/image2.jpg");
    await expectAsync(storage.addFileFromBuffer(buffer, "image3.jpg")).toBeResolved();
  });

  it("list files 3", async () => {
    const expectedResult: [string, number][] = [
      ["image1.jpg", 32201],
      ["image2.jpg", 42908],
      ["image3.jpg", 42908],
    ];
    await expectAsync(storage.listFiles()).toBeResolvedTo(expectedResult);
  });

  it("add & read file from storage", async () => {
    const buffer = await fs.promises.readFile("./tests/data/input.txt");
    await expectAsync(storage.addFileFromBuffer(buffer, "input.txt")).toBeResolved();

    const fileReadable = await storage.getFileAsReadable("input.txt");
    const data = await streamToString(fileReadable);

    expect(data).toEqual("hello world");
  });

  it("sizeOf", async () => {
    await expectAsync(storage.sizeOf("image1.jpg")).toBeResolvedTo(32201);
  });

  it("check if file exists: yes", async () => {
    await expectAsync(storage.fileExists("image1.jpg")).toBeResolvedTo(true);
  });

  it("check if file exists: nope", async () => {
    await expectAsync(storage.fileExists("image10.jpg")).toBeResolvedTo(false);
  });

  it("create bucket error", async () => {
    await expectAsync(storage.createBucket()).toBeRejectedWith("Please provide a bucket name");
  });

  it("create bucket error", async () => {
    await expectAsync(storage.createBucket("")).toBeRejectedWith("Please provide a bucket name");
  });

  it("create bucket error", async () => {
    await expectAsync(storage.createBucket(null)).toBeRejectedWith(
      "Can not use `null` as bucket name"
    );
  });

  it("create bucket error", async () => {
    await expectAsync(storage.createBucket("null")).toBeRejectedWith(
      'Can not use "null" as bucket name'
    );
  });

  it("create bucket error", async () => {
    await expectAsync(storage.createBucket("undefined")).toBeRejectedWith(
      'Can not use "undefined" as bucket name'
    );
  });

  it("create already existing bucket that you are not allowed to access", async () => {
    // the name "new-bucket" has already been taken by someone else (not for local)
    let r = storage.getType() === StorageType.LOCAL;
    try {
      const msg = await storage.createBucket("new-bucket");
      // console.log(msg);
    } catch (e) {
      r = e.message !== "ok" && e.message !== "";
      // console.log("R", r);
    }
    expect(r).toEqual(true);
  });

  it("create bucket", async () => {
    try {
      await storage.createBucket(newBucketName);
    } catch (e) {
      console.error("\x1b[31m", e, "\n");
    }
  });

  it("check created bucket", async () => {
    const buckets = await storage.listBuckets();
    const index = buckets.indexOf(newBucketName);
    expect(index).toBeGreaterThan(-1);
  });

  it("selected bucket", async () => {
    // local storage does not automatically slugify
    if (storage.getType() === "local") {
      expect(storage.getSelectedBucket()).not.toBe(slugify(bucketName as string));
    } else {
      expect(storage.getSelectedBucket()).toBe(slugify(bucketName as string));
    }
  });

  it("select bucket", async () => {
    await storage.selectBucket(newBucketName);
    expect(storage.getSelectedBucket()).toBe(slugify(newBucketName));
  });

  it("add file to new bucket", async () => {
    await expectAsync(
      storage.addFileFromPath("./tests/data/image1.jpg", "image1.jpg")
    ).toBeResolved();
  });

  it("list files in new bucket", async () => {
    const expectedResult: [string, number][] = [["image1.jpg", 32201]];
    await expectAsync(storage.listFiles()).toBeResolvedTo(expectedResult);
  });

  it("delete bucket currently selected non-empty bucket", async () => {
    const msg = await storage.deleteBucket();
    expect(storage.getSelectedBucket()).toBe("");
    const buckets = await storage.listBuckets();
    const index = buckets.indexOf(newBucketName);
    expect(index).toBe(-1);
  });

  it("create bucket", async () => {
    // expectAsync(storage.createBucket(newBucketName)).toBeResolved();
    try {
      await storage.createBucket(newBucketName);
    } catch (e) {
      console.error("\x1b[31m", e, "\n");
    }
  });

  it("check created bucket", async () => {
    const buckets = await storage.listBuckets();
    const index = buckets.indexOf(newBucketName);
    expect(index).not.toBe(-1);
  });

  it("clear bucket by providing a bucket name", async () => {
    await expectAsync(storage.clearBucket(newBucketName)).toBeResolved();
  });

  it("bucket should contain no files", async () => {
    await expectAsync(storage.selectBucket(newBucketName)).toBeResolvedTo("bucket selected");
    await expectAsync(storage.listFiles()).toBeResolvedTo([]);
  });

  it("delete bucket by providing a bucket name", async () => {
    const msg = await storage.deleteBucket(newBucketName);
    // console.log(msg);
    const buckets = await storage.listBuckets();
    const index = buckets.indexOf(newBucketName);
    expect(index).toBe(-1);
  });
});
