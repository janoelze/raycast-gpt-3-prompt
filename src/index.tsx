import { useEffect, useRef, useState } from "react";
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

function concatResponseFragments(responseFragments: Array<String>) {
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
  const data = await LocalStorage.getItem<string>(config.historyStorageKey) || "[]";
  const parsed = JSON.parse(data);
  cb(parsed.reverse());
}

async function pushToHistory(sanitizedPrompt: string) {
  if (!sanitizedPrompt || sanitizedPrompt.trim() == '') return;

  const data = await LocalStorage.getItem<string>(config.historyStorageKey) || "[]";
  let h = JSON.parse(data);

  if (h.includes(sanitizedPrompt)) {
    h.splice(h.indexOf(sanitizedPrompt), 1);
  } {
    h.push(sanitizedPrompt);
  }

  await LocalStorage.setItem(config.historyStorageKey, JSON.stringify(h));
}

async function* streamCompletion(data: Object) {
  let previous = "";
  for await (const chunk of data) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    previous += bufferChunk;
    let eolIndex;
    while ((eolIndex = previous.indexOf("\n")) >= 0) {
      const line = previous.slice(0, eolIndex + 1).trimEnd();
      if (line === "data: [DONE]") break;
      if (line.startsWith("data: ")){
        const message = line.substring("data :".length);
        const parsed = JSON.parse(message);
        if (parsed) {
          yield parsed;
        }
      }
      previous = previous.slice(eolIndex + 1);
    }
  }
}

type FormValues = {
  currentPrompt: string
  historyPrompt: string
}

export default function Command() {
  const [responseFragments, setResponseFragments] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isInitialFill, setIsInitialFill] = useState<boolean>(true);
  const [historyItems, setHistoryItems] = useState<string[]>([]);
  const currentPromptFieldRef = useRef<Form.TextArea>(null);

  const { handleSubmit, values, setValue } = useForm<FormValues>({
    async onSubmit(values) {
      executePrompt(values.currentPrompt);
    },
    initialValues: {
      currentPrompt: "",
      historyPrompt: ""
    }
  });

  // Fetch History
  useEffect(() => {
    getHistory((historyArr: Array<String>) => {
      setHistoryItems(historyArr.map((str) => str.toString()));
    });
  }, []);

  function handleSelectRecentPrompt(value: string) {
    if (isInitialFill) {
      setIsInitialFill(false);
      return;
    }else{
      setValue('currentPrompt', value);
    }
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

    setResponseFragments(previousArray => [
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

    for await (const parsedMessage of streamCompletion(completion.data)) {
      try {
        // const parsed = JSON.parse(message);
        const { text, finish_reason } = parsedMessage.choices[0];

        if (finish_reason === null) {
          setResponseFragments(previousArray => [
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
        console.error("Could not JSON parse stream message", parsedMessage, error);
      }
    }
  }

  if (responseFragments.length > 0) {
    const concatString = concatResponseFragments(responseFragments);
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

  let historyElem = null;

  if (historyItems.length > 0) {
    historyElem = (
      <Form.Dropdown
        id="historyPrompt"
        title="Recent Prompts"
        value={values.historyPrompt}
        onChange={handleSelectRecentPrompt}
      >
        {historyItems.map((prompt, index) => (
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
