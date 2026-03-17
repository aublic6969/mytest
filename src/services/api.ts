/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import CryptoJS from 'crypto-js';

const PROXY_BASE = "https://appx-proxy.vercel.app/proxy?url=";

export function getProxyUrl(url: string) {
  return PROXY_BASE + encodeURIComponent(url);
}

export function decrypt(enc: string): string {
  try {
    const cleanEnc = enc.split(":")[0];
    const key = CryptoJS.enc.Utf8.parse("638udh3829162018");
    const iv = CryptoJS.enc.Utf8.parse("fedcba9876543210");

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(cleanEnc) } as any,
      key,
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );

    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error("Decrypt error", e);
    return "";
  }
}

export function decode_base64(str: string): string {
  try {
    return atob(str);
  } catch (e) {
    return "";
  }
}

export const API_MAP = {
  courses: [
    "/get/courselistnewv2?exam_id=&start={start}",
    "/get/courselist?start={start}",
    "/get/allcourse?start={start}",
  ],
  purchased: [
    "/get/mycoursev2?userid={uid}",
    "/get/get_all_purchases?userid={uid}&item_type=10"
  ],
  live: [
    "/get/live_upcoming_course_classv2?start=-1&courseid={id}",
    "/get/course_contents_by_live_status?course_id={id}&start=-1&live_status=1,2",
    "/get/liveclasslist?course_id={id}",
  ],
  recorded: [
    "/get/get_previous_live_videos?course_id={id}&start={start}&folder_wise_course=1&userid={uid}",
    "/get/get_previous_live_videos?course_id={id}&start={start}&folder_wise_course=0&userid={uid}",
  ],
  player: [
    "/get/fetchVideoDetailsById?course_id={id}&folder_wise_course=1&ytflag=0&video_id={vid}",
    "/get/fetchVideoDetailsById?course_id={id}&folder_wise_course=0&ytflag=0&video_id={vid}",
    "/get/fetchVideoDetailsById?course_id={id}&video_id={vid}&ytflag=0&folder_wise_course=0",
  ],
  folder_subject: ["/get/allsubjectfrmlivecourseclass?courseid={id}&start=-1"],
  folder_topic: ["/get/alltopicfrmlivecourseclass?courseid={id}&subjectid={sid}&start=-1"],
  folder_concept: ["/get/allconceptfrmlivecourseclass?topicid={tid}&courseid={id}&subjectid={sid}&start=-1"],
  folder_video: [
    "/get/livecourseclassbycoursesubtopconceptapiv3?topicid={tid}&start=-1&conceptid=&courseid={id}&subjectid={sid}",
  ],
};

export async function fetchWithHeaders(url: string, auth: { token: string; userId: string }) {
  const headers = {
    Authorization: auth.token,
    "Client-Service": "Appx",
    "Auth-Key": "appxapi",
    "User-ID": auth.userId,
    source: "website",
  };

  try {
    const r = await fetch(url, { headers });
    const text = await r.text();

    if (text.trim().startsWith("<")) {
      return null;
    }

    return JSON.parse(text);
  } catch (e) {
    console.error("Fetch error:", url, e);
    return null;
  }
}

export async function fetchMultiAll(endpoints: string[], auth: { token: string; userId: string }) {
  let finalData: any[] = [];

  for (let url of endpoints) {
    const j = await fetchWithHeaders(url, auth);
    if (j?.data) {
      if (Array.isArray(j.data)) {
        finalData = [...finalData, ...j.data];
      } else {
        finalData.push(j.data);
      }
    }
  }

  return { data: finalData };
}
