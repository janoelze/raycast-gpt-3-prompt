import { useRef, useState } from "react";
import { Form, Detail, LocalStorage, ActionPanel, Action, showToast, getPreferenceValues, openCommandPreferences } from "@raycast/api";
import { Configuration, OpenAIApi } from "openai";
import { FormValidation, useCachedState, useForm } from '@raycast/utils';

interface Preferences {
  openai_api_key?: string;
}

const config = {
  historyStorageKey: "gpt-3-prompt-history-v2",
  maxHistoryItems: 20,
};

function concatResponseString(responseFragments) {
  let out = "";

  for (let i = 0; i < responseFragments.length; i++) {
    if (responseFragments[i] == '\n') {
      out += `\r\n`
    } else {
      out += responseFragments[i]
    };
  }

  return out;
}

async function getHistory(cb) {
  let data = await LocalStorage.getItem<string>(config.historyStorageKey) || "[]";
  cb(JSON.parse(data));
}

async function pushToHistory(sanitizedPrompt: string) {
  if (!sanitizedPrompt || sanitizedPrompt.trim() == '') return;

  const data = await LocalStorage.getItem<string>(config.historyStorageKey) || "[]";
  let h = JSON.parse(data);

  if (h.includes(sanitizedPrompt)) {
    h.splice(h.indexOf(sanitizedPrompt), 1);
  }{
    h.push(sanitizedPrompt);
  }

  await LocalStorage.setItem(config.historyStorageKey, JSON.stringify(h));
}

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

type FormValues = {
  currentPrompt: string
  historyPrompt: string
}

export default function Command() {
  const [responseString, setResponseString] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<string[]>([]);
  const currentPromptFieldRef = useRef<Form.TextArea>(null);

  const { handleSubmit, values, setValue } = useForm<FormValues>({
    async onSubmit(values) {
      executePrompt(values.currentPrompt);
    }
  });

  getHistory((historyArr) => {
    setHistory(historyArr);
  });

  function handleChangeHistoryPrompt(value: string) {
    setValue('currentPrompt', value);
    currentPromptFieldRef.current?.focus();
  }

  function handleChangeCurrentPrompt(value: string) {
    setValue('currentPrompt', value);
  }

  async function executePrompt(prompt: string) {
    const preferences = getPreferenceValues<Preferences>();
    const sanitizedPrompt = prompt.trim();

    if (!preferences.openai_api_key) {
      openCommandPreferences();
      return;
    }

    pushToHistory(sanitizedPrompt);
    setLoading(true);

    const configuration = new Configuration({
      apiKey: preferences.openai_api_key,
    });

    setResponseString(previousArray => [
      ...previousArray,
      `**${sanitizedPrompt}**`
    ]);

    const openai = new OpenAIApi(configuration);

    const completion = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: sanitizedPrompt,
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

        if (finish_reason === null) {
          setResponseString(previousArray => [
            ...previousArray,
            text
          ]);
        } else {
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
    const concatString = concatResponseString(responseString);
    return (
      <Detail
        isLoading={loading}
        markdown={concatString}
        actions={
          <ActionPanel>
            <Action.CopyToClipboard
              title="Copy Result"
              content={concatString}
            />
          </ActionPanel>
        }
      />
    );
  };

  let historyElem = '';

  if (history.length > 0) {
    historyElem = (
      <Form.Dropdown
        id="historyPrompt"
        title="Recent Prompts"
        value={values.historyPrompt}
        onChange={handleChangeHistoryPrompt}
      >
        {history.reverse().map((prompt, index) => (
          <Form.Dropdown.Item value={prompt} key={index} title={prompt} />
        ))}
      </Form.Dropdown>
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
      <Form.TextArea ref={currentPromptFieldRef} onChange={handleChangeCurrentPrompt} value={values.currentPrompt} autoFocus={true} id="currentPrompt" title="Prompt" placeholder="Enter a text prompt" />
      {historyElem}
    </Form>
  );
}
