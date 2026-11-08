*Last updated: {updated}*

> **This is a demo / training project, not a commercial service.** Please don't enter
> sensitive personal information (health, financial or identity details) into the chat.

This policy explains what personal data **{name}** collects, why, where it goes and what your rights are. Questions or requests go to {contact}.

## What we collect

| Data | Why | Where it is stored |
|---|---|---|
| **Account:** username, email address, a *hashed* password (never the password itself), your role | To let you sign in and to reset your password | The app's MySQL database |
| **Chats:** your messages, the answers, chat titles, files you upload (images, PDFs, audio) and transcripts of voice memos | To show your chat history and to answer you | The database; uploaded files in the app's `uploads` folder |
| **Usage data:** number of tokens, cost, response time, which options you used (Thinking, Streaming, Search), likes and dislikes | To understand the cost and quality of the demo | The database |
| **Security data:** hashed login keys, hashed password-reset codes, and the time of failed sign-ins per email address | To keep accounts safe | Redis (a small fast store); "Keep me signed in" keys also in the database |
| **Voice calls** with the voice agent | To run the live conversation | Not stored by the app (see ElevenLabs below) |
| **Technical data:** your IP address and browser details | Needed to deliver the website | Seen by the server and the services below |

The app uses **no** analytics, advertising or tracking tools, and your data is not sold. The fonts are served by the app itself.

## Services that receive data

| Service | What they receive | Why |
|---|---|---|
| **Google (Gemini API)** | Your messages, uploaded files and voice memos | To generate answers, chat titles and transcripts |
| **ElevenLabs** | Your voice and the conversation during a voice call | To run the voice agent |
| **Resend** | Your email address and the reset-code email | To send password-reset codes |

These companies may process data in other countries, under their own terms. This demo may use the **free tier** of the Gemini API: on that tier Google may use the content sent to it to improve its products, and people at Google may review it. That is one more reason not to share sensitive information here.

The app runs on the operator's own computer.

## How long data is kept

Chats, files and usage data are kept until your account is deleted. Deleting a chat in the app only hides it from your list. As this is a demo, all data may be deleted when the project ends. Security data is kept briefly: failed sign-ins for 15 minutes, reset codes for 15 minutes, login keys for 1 day, or up to 30 days with "Keep me signed in".

## Your rights

You can ask {contact} to **see**, **correct**, **export** or **delete** your data, or to **stop** using it. Deleting your account removes it together with all your chats, files and usage data. Depending on where you live, you can also complain to your local data-protection authority.

## Changes

If this policy changes, the date at the top is updated.
