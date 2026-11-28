from dotenv import load_dotenv
load_dotenv()

# For the type validation
from typing import List
from pydantic import BaseModel, Field

# All langchain tool
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

# For websearch - tavily_search can also be used
from tavily import TavilyClient

from models import AgentResponse


tavily = TavilyClient()

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
  return tavily.search(query=query)


llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite")
tools = [search]
agent = create_agent(model=llm, tools=tools, response_format=AgentResponse)


def main():
  print("Hello world")
  result = agent.invoke({"messages": HumanMessage("When is upcoming U.P, India election")})
  print(result)


if __name__ == "__main__":
  main()
