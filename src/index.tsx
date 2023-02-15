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

  const [state, setState] = useState({
    view: "form",
    prompt: "",
  });

  async function handleSubmit(values: Values) {
    const preferences = getPreferenceValues<Preferences>();

    showToast({ title: "One second please!", message: "Executing your prompt..." });
    setLoading(true);

    const configuration = new Configuration({
      apiKey: preferences.openai_api_key,
    });

    const openai = new OpenAIApi(configuration);

    const res = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: values.textarea,
      max_tokens: 2000,
      temperature: 0,
      stream: true,
    }, {
      responseType: 'stream'
    });

    res.data.on('data', data => {
      const dataString = data.toString();

      try {
        let responseData = JSON.parse(dataString.slice(6));
        if (responseData.choices) {
          const text = responseData.choices[0].text;
          setLoading(false);
          setResponseString(previousArray => [...previousArray, text]);
        }
      } catch (error) {
        showToast({ title: "Done", message: "Finished execution of the prompt" });
      }
    })
  }

  if (responseString.length > 0) {
    let renderedResponseString = responseString.join("");
    console.log(renderedResponseString);
    return (
      <Detail markdown={renderedResponseString} />
    );
  };

  if (loading) {
    return (
      <Detail markdown="*Hang tight!*" />
    );
  }; 

  if(state.view == "form") {
    return (
      <Form
        actions={
          <ActionPanel>
            <Action.SubmitForm onSubmit={handleSubmit} />
          </ActionPanel>
        }
      >
        <Form.TextArea id="textarea" title="Prompt" placeholder="Enter the prompt to execute" />
      </Form>
    );
  };
}
