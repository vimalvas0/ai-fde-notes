from dotenv import load_dotenv
load_dotenv()

from langchain.chat_models import init_chat_model
from langchain.tools import tool
from langchain.messages import HumanMessage, SystemMessage, ToolMessage
from langsmith import traceable

MAX_ITERATIONS = 10
MODEL = "qwen3:1.7b"



@tool
def get_product_price(product: str) -> float:
  """Lookup the price of a product in the catalog"""
  print(f" >> Executing get_product_price(product='{product}')")
  prices = {"laptop": 341.99, "phone": 99.99}
  return prices.get(product, 0)

@tool
def apply_discount(price: float, discount_tier: str) -> float:
  """This applies the discount tier to a price returning final price"""
  discount_percentage = 0
  if discount_tier == "BRONZE":
    discount_percentage = 5
  elif discount_tier == "SILVER":
    discount_percentage = 10
  elif discount_tier == "GOLD":
    discount_percentage = 20

  return price * (1 - (discount_percentage / 100))


@traceable=(name="Langchain Agent Loop")
def run_agent(question: str):
  tools = [get_product_price, apply_discount]

  tools_dict = {t.name: t for t in tools}


  llm = init_chat_model(f"ollama:{MODEL}", temperature=0)
  llm_with_tools = llm.bind_tools(tools)

  print(f"Question: {question}")
  print("=" * 60)

  messages = {
    content = {
      
    }
  }



if __name__ == "__main__":
  print("Hello Langchain")

