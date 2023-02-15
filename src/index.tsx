import { useState } from "react"; 
import { Form, Detail, ActionPanel, Action, showToast, getPreferenceValues, openCommandPreferences } from "@raycast/api";
import { Configuration, OpenAIApi } from "openai";

interface Preferences {
  openai_api_key?: string;
}

type Values = {
  textarea: string;
};

async function* chunksToLines(chunksAsync) {
  let previous = "";
  for await (const chunk of chunksAsync) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    previous += bufferChunk;
    let eolIndex;
    while ((eolIndex = previous.indexOf("\n")) >= 0) {
      const line = previous.slice(0, eolIndex + 1).trimEnd();
      if (line === "data: [DONE]") break;
      if (line.startsWith("data: ")) yield line;
      previous = previous.slice(eolIndex + 1);
    }
  }
}

async function* linesToMessages(linesAsync) {
  for await (const line of linesAsync) {
    const message = line.substring("data :".length);
    yield message;
  }
}

async function* streamCompletion(data) {
  yield* linesToMessages(chunksToLines(data));
}

export default function Command() {
  const [responseString, setResponseString] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  function getResponseString () {
    let out = "";

    for(let i = 0; i < responseString.length; i++){
      if (responseString[i] == '\n'){
        out += `\r\n`
      }else{
        out += responseString[i]
      };
    }

    return out;
  }

  async function handleSubmit(values: Values) {
    const preferences = getPreferenceValues<Preferences>();
    const prompt = values.textarea.trim();

    setLoading(true);

    const configuration = new Configuration({
      apiKey: preferences.openai_api_key,
    });

    setResponseString(previousArray => [
      ...previousArray,
      `**${prompt}**`
    ]);

    const openai = new OpenAIApi(configuration);

    const completion = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 4000,
      temperature: 0,
      stream: true,
    }, {
      responseType: 'stream'
    });

    for await (const message of streamCompletion(completion.data)) {
      try {
        const parsed = JSON.parse(message);
        const { text, finish_reason } = parsed.choices[0];

        if (finish_reason === null){
          setResponseString(previousArray => [
            ...previousArray,
            text
          ]);
        }else{
          showToast({
            title: "Done",
            message: "Finished execution of the prompt!"
          });

          setLoading(false);
        };
      } catch (error) {
        console.error("Could not JSON parse stream message", message, error);
      }
    }
  }

  if (responseString.length > 0) {
    return (
      <Detail
        isLoading={loading}
        markdown={getResponseString()}
        actions={
          <ActionPanel>
            <Action.CopyToClipboard
              title="Copy Result"
              content={getResponseString()}
            />
          </ActionPanel>
        }
      />
    );
  };

  return (
    <Form
      navigationTitle="GPT-3 Prompt"
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea autoFocus={true} id="textarea" title="Prompt" placeholder="Enter the prompt to execute" />
    </Form>
  );
}
