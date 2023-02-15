import { useState } from "react"; 
import { Form, Detail, ActionPanel, Action, showToast, getPreferenceValues, openCommandPreferences } from "@raycast/api";
import { Configuration, OpenAIApi } from "openai";

interface Preferences {
  openai_api_key?: string;
}

type Values = {
  textfield: string;
  textarea: string;
  datepicker: Date;
  checkbox: boolean;
  dropdown: string;
  tokeneditor: string[];
};

export default function Command() {
  const [responseString, setResponseString] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

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

    const res = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 2000,
      temperature: 0,
      stream: true,
    }, {
      responseType: 'stream'
    });

    res.data.on('data', data => {
      const dataString = data.toString();

      try {
        let responseData = JSON.parse(dataString.replace("data: {", "{"));

        if (responseData.choices && responseData.choices.length > 0) {
          setResponseString(previousArray => [
            ...previousArray,
            responseData.choices[0].text
          ]);
        }
      } catch (error) {
        showToast({ title: "Done", message: "Finished execution of the prompt" });
        setLoading(false);
      }
    })
  }

  if (responseString.length > 0) {
    return (
      <Detail isLoading={loading} markdown={responseString.join("")} />
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
