import { useState, useEffect, useRef } from "react";
import Link from "next/link";

import axios from "axios";
import slugify from "slugify";
import * as imageConversion from "image-conversion";
import dayjs from "dayjs";
import { FaCheck } from "react-icons/fa";

import GetTestData from "../../lib/TestData";
import ScriptUtils from "../../lib/ScriptUtils";
import FirebaseUtils from "../../lib/FirebaseUtils";
import { Dropzone } from "../forms/FormUtils";
import Checkbox from "../forms/Checkbox";

import style from "./AdminPanel.module.css";

const ClearData = async (onSuccess, onFail) => {
    try {
        const response = await axios("/api/admin/clear");
        if (response.data.error) throw response.data.error;
        console.log("data", response.data);
        onSuccess(response.data);
    } catch (error) {
        console.error("error", error);
        onFail("Error: " + ScriptUtils.tryFormatError(error.message));
    }
};

const AddData = async (scripts, onMessage, onProgress, onSuccess, onFail) => {
    let errorCount = 0;

    onMessage(`Adding ${scripts.length} scripts to the database`);

    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];

        try {
            onMessage(`Inserting ${script.name}`);

            const response = await axios.post("/api/scripts/create", script);
            if (response.data.error) throw response.data.error;
            console.log("data", response.data);

            onProgress(i + 1, scripts.length);
            onMessage(`${script.name} sucessfully inserted (${i + 1}/${scripts.length})`);
            onMessage("");
        } catch (error) {
            console.error("error", error);
            onProgress(i + 1, scripts.length);
            onMessage("Error: " + ScriptUtils.tryFormatError(error.message));
            onMessage("");
            errorCount++;
        }
    }

    if (errorCount === 0) onSuccess(scripts.length);
    else onFail(errorCount, scripts.length);
};

const Aggregate = async (onMessage, onSuccess, onFail) => {
    onMessage(`Running data aggregation`);

    try {
        const response = await axios.get("/api/admin/aggregate");
        if (response.data.error) throw response.data.error;
        console.log("data", response.data);
        onMessage(`Finished aggregating creator data: ${JSON.stringify(response.data, null, 2)}`);
        onMessage("");
        onSuccess();
    } catch (error) {
        console.error("error", error);
        onMessage("Error: " + ScriptUtils.tryFormatError(error.message));
        onMessage("");
        onFail();
    }
};

const UploadFile = async (file, name, onMessage, onSuccess, onFail) => {
    onMessage(`Uploading ${file.name} (${file.size} bytes)`);
    try {
        const compressedFile = await imageConversion.compressAccurately(file, {
            size: 100,
            type: "image/jpeg",
        });
        const url = await FirebaseUtils.uploadFile(
            compressedFile,
            "adminthumbnails/" + name,
            () => {}
        );
        onSuccess(url);
    } catch (error) {
        console.error("error", error);

        onMessage("");
        onFail(error);
    }
};

const GetJsonBackup = async (onMessage, onSuccess, onFail) => {
    onMessage("Fetching all scripts as JSON");
    try {
        const response = await axios({
            url: "/api/scripts/asJson",
            method: "GET",
            responseType: "blob",
        });
        if (response.data.error) throw response.data.error;
        const url = window.URL.createObjectURL(new Blob([response.data]));
        onSuccess(url);
    } catch (error) {
        console.error("error", error);
        onFail();
    }
};

const RunScrape = async (scripts, cookie, subset, onMessage, onProgress, onComplete, onError) => {
    onMessage("Scraping all views and likes from EroScripts");
    onMessage("--Fetching all scripts from database");
    const response = await axios.post("/api/scripts", { take: 99999 });
    if (response.data.error) {
        onError(response.data.error);
        onComplete();
        return;
    }
    scripts = !subset
        ? response.data.filter(script => script.sourceUrl.includes("eroscripts"))
        : response.data.filter(script => {
              if (!script.sourceUrl.includes("eroscripts")) return false;
              return (
                  script.views < 100 ||
                  script.likeCount < 5 ||
                  dayjs().diff(dayjs(script.created), "day") < 7
              );
          });
    onMessage(
        `----Complete - found ${scripts.length} scripts${subset ? " (after filtering)" : ""}`
    );
    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        try {
            onMessage("--Scraping data for " + script.slug);
            console.log(process.env);
            const response = await axios.post("/api/admin/scrape", {
                slug: script.slug,
                url: script.sourceUrl,
            });
            console.log(response.data);
            if (response.data.error) throw response.data.error.message;
            onMessage(
                `----Success - set likes to ${response.data.likeCount}, views to ${response.data.views} and date to ${response.data.created}`
            );
        } catch (error) {
            onError(error.message || error);
        } finally {
            onProgress(i + 1, scripts.length);
        }
    }
    onComplete();
};

const AdminPanel = ({ user, existingScripts }) => {
    const [running, setRunning] = useState(false);
    const [messages, setMessages] = useState({ list: [] });
    const [count, setCount] = useState(41);
    const [scripts, setScripts] = useState([]);

    useEffect(() => {
        setScripts(existingScripts);
    }, [existingScripts]);

    useEffect(() => {
        setCount(GetTestData().length);
    }, []);

    //page is blocked if user is not signed in
    /*
    const {user} = useContext(UserContext);
    /*
    useEffect(() => {
        if(user !== null && user.waiting) return;
        if(user === null) Router.push("/");
        else if(!user.isAdmin) Router.push("/");
    }, [user])
    */

    const addMessage = message => {
        setMessages(cur => ({ list: [...cur.list, message] }));
    };

    const StartClearData = () => {
        if (!confirm("Warning, this will irrecoverably wipe ALL data (except user data)!")) return;

        setRunning(true);
        addMessage("Wiping Database...");

        ClearData(
            data => {
                addMessage("Data cleared successfully");
                addMessage("");
                setRunning(false);
                setScripts([]);
            },
            error => {
                addMessage("Failed to clear data");
                addMessage(error);
                addMessage("");
                setRunning(false);
            }
        );
    };

    const progressBarRef = useRef();
    const progressBarParentRef = useRef();
    const StartAddData = () => {
        setRunning(true);

        progressBarParentRef.current.style.setProperty("display", "block");
        progressBarRef.current.style.setProperty("width", "0%");

        const scriptsToAdd = GetTestData()
            .slice(0, count)
            .filter(script => {
                return scripts.findIndex(s => s.name === script.name) === -1;
            });

        AddData(
            scriptsToAdd,
            addMessage,
            (count, total) => {
                progressBarRef.current.style.setProperty(
                    "width",
                    `${Math.round((count * 100) / total)}%`
                );
            },
            addedCount => {
                addMessage(`Successfully added ${addedCount} scripts to database`);
                addMessage("");
                progressBarParentRef.current.style.setProperty("display", "none");
                setRunning(false);
            },
            (failCount, scriptCount) => {
                addMessage("Finished adding scripts");
                addMessage(`Error: failed ${failCount} out of ${scriptCount}`);
                addMessage("");
                progressBarParentRef.current.style.setProperty("display", "none");
                setRunning(false);
            }
        );
    };

    const StartAggregation = () => {
        setRunning(true);

        Aggregate(
            addMessage,
            () => {
                addMessage("Finished aggregating data");
                addMessage("");
                setRunning(false);
            },
            () => {
                addMessage("Error: Failed aggregating data");
                addMessage("");
                setRunning(false);
            }
        );
    };

    const ClearOutput = () => {
        setMessages({ list: [] });
    };

    const [thumbnailImage, setThumbnailImage] = useState(null);
    const StartUploadFile = () => {
        console.log("Thumbnail", thumbnailImage);
        if (!thumbnailImage) {
            addMessage("Error: No thumbnail image provided");
            return;
        }

        let name = prompt("Input thumbnail file name (will be slugified)");
        name = slugify(name, { lower: true, strict: true });

        setRunning(true);

        UploadFile(
            thumbnailImage.target.value[0],
            name,
            message => {
                addMessage(message);
            },
            url => {
                addMessage("File uploaded successfully:");
                addMessage(url);
                addMessage("");
                setRunning(false);
            },
            error => {
                addMessage("Error: " + error);
                addMessage("");
                setRunning(false);
            }
        );

        addMessage(
            `Uploading thumbnail image ${thumbnailImage.target.value[0].name} (${thumbnailImage.target.value[0].size} bytes)`
        );
    };

    const [preparedDownload, setPreparedDownload] = useState("");
    const StartGetJsonBackup = () => {
        setPreparedDownload("");
        GetJsonBackup(
            addMessage,
            url => {
                setPreparedDownload(url);
                addMessage(`Successfully fetched script data. Click Download to get JSON file`);
                addMessage("");
            },
            error => {
                addMessage("Error: " + error);
            }
        );
    };

    const [scrapeCookie, setScrapeCookie] = useState("");
    const [scrapeSubset, setScrapeSubset] = useState(true);
    const StartScrape = () => {
        setRunning(true);
        progressBarParentRef.current.style.setProperty("display", "block");
        progressBarRef.current.style.setProperty("width", "0%");

        RunScrape(
            existingScripts,
            scrapeCookie,
            scrapeSubset,
            addMessage,
            (count, total) => {
                progressBarRef.current.style.setProperty(
                    "width",
                    `${Math.round((count * 100) / total)}%`
                );
            },
            () => {
                addMessage("Scrape completed successfully");
                addMessage("");
                setRunning("");
                progressBarParentRef.current.style.setProperty("display", "none");
            },
            error => {
                addMessage("Error: " + error);
            }
        );
    };

    //if(user === null || user.waiting) return <div></div>

    return (
        <>
            <div className={`${style.buttons} ${running ? style.hidden : ""}`}>
                <button onClick={ClearOutput}>Clear Output</button>
                <button onClick={StartClearData}>Wipe Database</button>
                <button onClick={StartAddData}>Add Test Data</button>
                <input
                    type="number"
                    id="count"
                    onChange={e => setCount(parseInt(e.target.value))}
                    value={count}
                ></input>
                <button onClick={StartAggregation}>Run Aggregation</button>
                <Dropzone
                    id="thumbnail"
                    name="thumbnail"
                    label=""
                    className={style.dropzone}
                    hoveringClassName={style.dropzoneon}
                    instruction="Drag + drop a thumbnail image, or click to select one"
                    options={{
                        accept: ["image/png", "image/jpeg"],
                        //maxSize: 2000000, //2MB
                        multiple: false,
                        noKeyboard: true,
                        preventDropOnDocument: true,
                        pasteable: true,
                    }}
                    onChange={setThumbnailImage}
                    onError={error => addMessage("Error: " + error)}
                    error={""}
                    value={thumbnailImage}
                />
                <button onClick={StartUploadFile}>Upload Image</button>
            </div>
            <div className={`${style.buttons} ${running ? style.hidden : ""}`}>
                <button onClick={StartGetJsonBackup}>Prepare JSON Backup</button>
                <Link href={preparedDownload}>
                    <a
                        style={preparedDownload !== "" ? null : { display: "none" }}
                        download={"ScriptAxisBackup.json"}
                    >
                        Download JSON Backup
                    </a>
                </Link>
                <div className={style.scrape}>
                    <input
                        id="scrapeCookie"
                        type="text"
                        value={scrapeCookie}
                        onChange={e => setScrapeCookie(e.target.value)}
                        placeholder="Scrape Cookie"
                    />
                    <label>
                        {"Scrape"}
                        <br />
                        {"Subset"}
                    </label>
                    <Checkbox
                        className={style.checkbox}
                        checked={scrapeSubset}
                        onChange={e => setScrapeSubset(e.target.checked)}
                    >
                        <FaCheck />
                    </Checkbox>
                    <button onClick={StartScrape}>Scrape Views and Likes</button>
                </div>
            </div>
            <div className={style.progressbg} ref={progressBarParentRef}>
                <div className={style.progressbar} ref={progressBarRef}></div>
            </div>
            <div className={style.output}>
                <ul>
                    {messages.list.map((message, index) => {
                        return message === "" ? (
                            <br key={index} />
                        ) : (
                            <li
                                key={index}
                                style={message.includes("Error") ? { color: "salmon" } : null}
                            >
                                {message}
                            </li>
                        );
                    })}
                </ul>
            </div>
            <div className={`loader top ${running ? "loadingtop" : "notloadingtop"}`}></div>
            <div
                className={`loader bottom ${running ? "loadingbottom" : "notloadingbottom"}`}
            ></div>
        </>
    );
};

export default AdminPanel;
