from dotenv import load_dotenv
load_dotenv()

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

def main():
  print("Hello from Gemini")


@tool
def search(query: str) -> str:
  """
  Tool that searches over internet
  Args:
    query: The query to search for
  Returns:
    The search result
  """
  print(f"Searching for query: {query}")
  return "Tokyo weather is sunny"


llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite")
tools = [search]
agent = create_agent(model=llm, tools=tools)


def main():
  print("Hello world")
  result = agent.invoke({"messages": HumanMessage("What is weather in tokyo")})
  print(result)


if __name__ == "__main__":
  main()
